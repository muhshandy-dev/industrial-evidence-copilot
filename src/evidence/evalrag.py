"""Evaluasi RAG yang dapat direproduksi: pencarian, jawaban bersitasi, dan penolakan.

Aturan yang dijaga kode ini:
- Satu-satunya yang disetel adalah ambang penolakan, dan hanya dari split dev.
- Split test dilaporkan sekali dengan ambang itu. Tidak ada pemilihan metode dari test.
- Semua interval adalah bootstrap persentil per pertanyaan dengan seed tetap.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from . import metrics as M
from .answer import extract_answer
from .corpus import Corpus
from .evalset import key_hit, relevant, summary
from .retriever import Retriever

K_LIST = (1, 3, 5, 10)
# Ambang penolakan dalam satuan skor BM25 pasal teratas.
THRESHOLD_GRID = tuple(float(i) for i in range(0, 41))
N_BOOT = 2000

# Konfigurasi yang diuji. "kirim" adalah yang dipakai website.
VARIANTS = (
    ("bm25_polos", "BM25, tanpa stem, tanpa konteks", dict(use_stem=False, context=False), "bm25"),
    ("bm25_stem", "BM25 + stem Indonesia", dict(use_stem=True, context=False), "bm25"),
    ("bm25_konteks", "BM25 + stem + chunk kontekstual", dict(use_stem=True, context=True), "bm25"),
    ("lsa_konteks", "LSA (vektor dari korpus) + konteks", dict(use_stem=True, context=True), "lsa"),
    ("hybrid", "Hibrida BM25 + LSA (RRF)", dict(use_stem=True, context=True), "hybrid"),
)


@dataclass
class System:
    key: str
    label: str
    retriever: Retriever
    method: str
    context: bool


def build_systems(corpus: Corpus) -> dict[str, System]:
    cache: dict[tuple[bool, bool], Retriever] = {}
    out: dict[str, System] = {}
    for key, label, cfg, method in VARIANTS:
        sig = (cfg["use_stem"], cfg["context"])
        if sig not in cache:
            texts = [
                corpus.index_text(i, context=cfg["context"]) for i in range(len(corpus.chunks))
            ]
            cache[sig] = Retriever(texts, use_stem=cfg["use_stem"])
        out[key] = System(key, label, cache[sig], method, cfg["context"])
    return out


def _random_hit(n: int, g: int, k: int) -> float:
    """Peluang acak murni menaruh minimal satu dari g bukti emas di k teratas dari n chunk."""
    if n - g < k:
        return 1.0
    return 1.0 - math.comb(n - g, k) / math.comb(n, k)


def _retrieval_row(ranked: list[str], gold: set[str]) -> dict[str, float]:
    row = {f"hit@{k}": M.hit_at_k(ranked, gold, k) for k in K_LIST}
    row["mrr@10"] = M.reciprocal_rank(ranked, gold, 10)
    row["ndcg@10"] = M.ndcg_at_k(ranked, gold, 10)
    return row


def _mean_ci(values: list[float], seed: int = 0) -> dict[str, float]:
    arr = np.asarray(values, dtype=np.float64)
    lo, hi = M.bootstrap_ci(arr, n_boot=N_BOOT, seed=seed)
    return {"nilai": round(float(arr.mean()), 4), "bawah": round(lo, 4), "atas": round(hi, 4)}


def eval_retrieval(corpus: Corpus, systems: dict[str, System], rows: list[dict]) -> dict:
    ids = [c.id for c in corpus.chunks]
    answerable = [r for r in rows if r["gold"]]
    per_q: dict[str, dict[str, list[dict[str, float]]]] = {}
    strict: dict[str, dict[str, list[dict[str, float]]]] = {}
    for key, sys_ in systems.items():
        per_q[key] = {"dev": [], "test": []}
        strict[key] = {"dev": [], "test": []}
        for r in answerable:
            ranked = [ids[i] for i in sys_.retriever.search(r["tanya"], sys_.method, 10)]
            per_q[key][r["split"]].append(_retrieval_row(ranked, relevant(r)))
            strict[key][r["split"]].append(_retrieval_row(ranked, set(r["gold"])))
    result: dict = {"per_sistem": {}, "selisih_berpasangan": {}}
    metric_names = list(next(iter(per_q.values()))["test"][0].keys())
    for key, sys_ in systems.items():
        entry: dict = {"label": sys_.label, "metrik": {}}
        for split in ("dev", "test"):
            entry["metrik"][split] = {
                m: _mean_ci([q[m] for q in per_q[key][split]]) for m in metric_names
            }
        # Rincian per gaya pertanyaan, hanya test.
        by_gaya: dict[str, dict] = {}
        test_rows = [r for r in answerable if r["split"] == "test"]
        for gaya in ("leksikal", "parafrase"):
            idx = [i for i, r in enumerate(test_rows) if r["gaya"] == gaya]
            by_gaya[gaya] = {
                "n": len(idx),
                **{
                    m: _mean_ci([per_q[key]["test"][i][m] for i in idx])
                    for m in ("hit@1", "hit@5", "mrr@10")
                },
            }
        entry["per_gaya_test"] = by_gaya
        entry["metrik_ketat_test"] = {
            m: _mean_ci([q[m] for q in strict[key]["test"]]) for m in ("hit@1", "hit@5", "mrr@10")
        }
        result["per_sistem"][key] = entry
    # Pembanding acak, analitik.
    n = len(ids)
    result["acak"] = {
        f"hit@{k}": round(
            float(np.mean([_random_hit(n, len(r["gold"]), k) for r in answerable])), 4
        )
        for k in K_LIST
    }
    for a, b in (
        ("hybrid", "bm25_konteks"),
        ("hybrid", "bm25_polos"),
        ("bm25_konteks", "bm25_polos"),
    ):
        d: dict = {}
        for m in ("hit@5", "mrr@10"):
            mean, lo, hi = M.paired_bootstrap_diff(
                np.array([q[m] for q in per_q[a]["test"]]),
                np.array([q[m] for q in per_q[b]["test"]]),
                n_boot=N_BOOT,
            )
            d[m] = {"selisih": round(mean, 4), "bawah": round(lo, 4), "atas": round(hi, 4)}
        result["selisih_berpasangan"][f"{a}_vs_{b}"] = d
    return result


# ---------------------------------------------------------------- jawaban dan penolakan


def _norm_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def answer_all(corpus: Corpus, system: System, rows: list[dict], threshold: float) -> list[dict]:
    """Jalankan jawaban ekstraktif untuk semua pertanyaan pada satu ambang."""
    ids = [c.id for c in corpus.chunks]
    match = [corpus.match_text(i) for i in range(len(ids))]
    shown = [c.teks for c in corpus.chunks]
    idf = system.retriever.bm25.idf
    out = []
    for r in rows:
        ranked = system.retriever.search(r["tanya"], system.method, 10)
        top_score = (
            float(
                system.retriever.bm25.scores(system.retriever.query_tokens(r["tanya"]))[ranked[0]]
            )
            if ranked
            else 0.0
        )
        ans = extract_answer(
            r["tanya"],
            ranked,
            match,
            idf,
            top_score=top_score,
            threshold=threshold,
            display_texts=shown,
        )
        gold = relevant(r)
        cited = [ids[e.chunk_idx] for e in ans.evidence]
        verbatim = all(_norm_ws(e.text) in _norm_ws(shown[e.chunk_idx]) for e in ans.evidence)
        rec = {
            "id": r["id"],
            "split": r["split"],
            "gaya": r["gaya"],
            "terjawab": bool(gold),
            "menolak": ans.abstain,
            "skor": round(ans.score, 4),
            "cakupan": round(ans.coverage, 4),
            "sitasi": cited,
            "verbatim": verbatim,
            "top1": ids[ranked[0]],
        }
        if gold:
            rec["sitasi_benar"] = bool(cited) and cited[0] in gold
            rec["kunci_ada"] = bool(cited) and key_hit(
                r["kunci"], " ".join(e.match for e in ans.evidence)
            )
            rec["benar"] = (not ans.abstain) and rec["sitasi_benar"] and rec["kunci_ada"]
            rec["benar_ketat"] = rec["benar"] and bool(cited) and cited[0] in set(r["gold"])
        out.append(rec)
    return out


def _balanced(recs: list[dict]) -> float:
    ans = [r for r in recs if r["terjawab"]]
    una = [r for r in recs if not r["terjawab"]]
    a = np.mean([r["benar"] for r in ans]) if ans else 0.0
    b = np.mean([r["menolak"] for r in una]) if una else 0.0
    return float(0.5 * (a + b))


def calibrate_threshold(
    corpus: Corpus, system: System, rows: list[dict]
) -> tuple[float, list[dict]]:
    """Pilih ambang dari split dev saja: skor seimbang tertinggi, ambang terkecil bila seri."""
    dev = [r for r in rows if r["split"] == "dev"]
    sweep = []
    for t in THRESHOLD_GRID:
        recs = answer_all(corpus, system, dev, t)
        sweep.append({"ambang": t, "skor_seimbang_dev": round(_balanced(recs), 4)})
    best = max(sweep, key=lambda s: (s["skor_seimbang_dev"], -s["ambang"]))
    return best["ambang"], sweep


def _rate(recs: list[dict], pred) -> dict[str, float]:
    k = sum(1 for r in recs if pred(r))
    lo, hi = M.wilson_ci(k, len(recs))
    return {
        "n": len(recs),
        "k": k,
        "nilai": round(k / len(recs), 4) if recs else 0.0,
        "bawah": round(lo, 4),
        "atas": round(hi, 4),
    }


def summarize_answers(recs: list[dict]) -> dict:
    ans = [r for r in recs if r["terjawab"]]
    una = [r for r in recs if not r["terjawab"]]
    answered = [r for r in ans if not r["menolak"]]
    out = {
        "jawaban_benar": _rate(ans, lambda r: r["benar"]),
        "jawaban_benar_ketat": _rate(ans, lambda r: r["benar_ketat"]),
        "sitasi_benar_dari_yang_dijawab": _rate(answered, lambda r: r["sitasi_benar"]),
        "kunci_fakta_ada_dari_yang_dijawab": _rate(answered, lambda r: r["kunci_ada"]),
        "menolak_padahal_terjawab": _rate(ans, lambda r: r["menolak"]),
        "dijawab_padahal_tak_terjawab": _rate(una, lambda r: not r["menolak"]),
        "kutipan_tidak_verbatim": {
            "n": sum(len(r["sitasi"]) > 0 for r in recs),
            "jumlah": sum(not r["verbatim"] for r in recs),
        },
    }
    for gaya in ("dekat", "luar"):
        g = [r for r in una if r["gaya"] == gaya]
        out[f"dijawab_padahal_tak_terjawab_{gaya}"] = _rate(g, lambda r: not r["menolak"])
    for gaya in ("leksikal", "parafrase"):
        g = [r for r in ans if r["gaya"] == gaya]
        out[f"jawaban_benar_{gaya}"] = _rate(g, lambda r: r["benar"])
    return out


def failures(rows: list[dict], recs: list[dict], corpus: Corpus) -> list[dict]:
    """Daftar kegagalan test untuk analisis galat; teks pertanyaan ikut dicatat."""
    by_id = {r["id"]: r for r in rows}
    out = []
    for rec in recs:
        if rec["split"] != "test":
            continue
        q = by_id[rec["id"]]
        if rec["terjawab"]:
            if rec["benar"]:
                continue
            if rec["menolak"]:
                kind = "menolak_padahal_terjawab"
            elif not rec["sitasi_benar"]:
                kind = "sitasi_pasal_salah"
            else:
                kind = "pasal_benar_kunci_tidak_ada"
        else:
            if rec["menolak"]:
                continue
            kind = "dijawab_padahal_tak_terjawab"
        out.append(
            {
                "id": rec["id"],
                "jenis": kind,
                "tanya": q["tanya"],
                "emas": q["gold"],
                "sitasi": rec["sitasi"],
                "top1": rec["top1"],
                "skor": rec["skor"],
            }
        )
    return out


# ---------------------------------------------------------------- orkestrasi


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(corpus_path: Path, questions_path: Path) -> dict:
    from .evalset import read_questions, validate

    corpus = Corpus.read(corpus_path)
    rows = read_questions(questions_path)
    problems = validate(rows, corpus)
    if problems:
        raise SystemExit("set pertanyaan tidak valid:\n" + "\n".join(problems[:20]))
    if corpus.asal != "nyata":
        raise SystemExit("evaluasi hanya sah pada korpus nyata")
    systems = build_systems(corpus)
    retrieval = eval_retrieval(corpus, systems, rows)
    shipped_key = max(
        retrieval["per_sistem"],
        key=lambda k: retrieval["per_sistem"][k]["metrik"]["dev"]["mrr@10"]["nilai"],
    )
    shipped = systems[shipped_key]
    threshold, sweep = calibrate_threshold(corpus, shipped, rows)
    recs = answer_all(corpus, shipped, rows, threshold)
    ans_summary = {
        split: summarize_answers([r for r in recs if r["split"] == split])
        for split in ("dev", "test")
    }
    # Pembanding: selalu menjawab (ambang 0) dan ambang tetap 0,5 sebelum disetel.
    base = {}
    for name, t in (("selalu_menjawab", 0.0),):
        base[name] = summarize_answers(
            [r for r in answer_all(corpus, shipped, rows, t) if r["split"] == "test"]
        )
    test_sweep = []
    for t in THRESHOLD_GRID:
        rr = [r for r in answer_all(corpus, shipped, rows, t) if r["split"] == "test"]
        ans = [r for r in rr if r["terjawab"]]
        una = [r for r in rr if not r["terjawab"]]
        test_sweep.append(
            {
                "ambang": t,
                "jawaban_benar": round(float(np.mean([r["benar"] for r in ans])), 4),
                "dijawab_padahal_tak_terjawab": round(
                    float(np.mean([not r["menolak"] for r in una])), 4
                ),
            }
        )
    return {
        "versi": 1,
        "korpus": {
            "asal": corpus.asal,
            "dokumen": len(corpus.docs),
            "pasal": len(corpus.chunks),
            "sha256": _sha(corpus_path),
        },
        "pertanyaan": {"sha256": _sha(questions_path), **summary(rows)},
        "lingkungan": {"python": platform.python_version(), "numpy": np.__version__},
        "metode_dikirim": shipped_key,
        "aturan_pilih_metode": "MRR@10 tertinggi pada split dev, di antara lima konfigurasi.",
        "aturan": [
            "Pembagian dev/test dibekukan sebelum evaluasi dijalankan.",
            "Hanya ambang penolakan yang disetel, dari dev; tidak ada penyetelan lain.",
            "Test dilaporkan sekali dengan ambang dari dev.",
        ],
        "pencarian": retrieval,
        "ambang": {"terpilih": threshold, "sapuan_dev": sweep, "sapuan_test": test_sweep},
        "jawaban": ans_summary,
        "pembanding_jawaban": base,
        "kegagalan_test": failures(rows, recs, corpus),
    }


def write_results(res: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
