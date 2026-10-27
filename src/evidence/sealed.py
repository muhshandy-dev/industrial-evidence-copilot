"""Evaluasi set tersegel: dijalankan SEKALI, setelah desain sistem dibekukan.

Set eval/sealed/questions.jsonl ditulis agen terpisah yang tidak melihat keluaran sistem, dan
hash-nya di-commit sebelum evaluasi apa pun (eval/sealed.sha256). Modul ini:

- menolak bila isi set berubah dari hash yang di-commit;
- menolak bila hasil tersegel sudah ada (eval/sealed/hasil.json adalah penanda sekali jalan);
- memakai metode, ambang, prompt, dan model yang sudah dikunci di eval/results.json, tanpa
  memilih atau menyetel apa pun dari set ini;
- menulis hasil apa adanya, termasuk commit git yang dievaluasi.

Alurnya dijalankan workflow .github/workflows/tersegel.yml: `eval-sealed input` -> generasi
(web/scripts/generate.mjs) -> `gen-merge` -> `nli` -> `eval-sealed run`.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from . import generation
from . import metrics as M
from .evalset import read_questions, relevant, validate

SET_FILES = ("sealed/questions.jsonl", "sealed/injeksi.jsonl")
# Konfigurasi generatif yang dievaluasi pada set tersegel: prompt situs dengan model situs (server
# bila sudah dipilih, dan dua model lokal).
KONFIGURASI_TERSEGEL = ("bertahan", "bertahan-cpu") + (
    () if generation.SERVER_SITUS is None else (generation.konfigurasi_server(),)
)


def result_path(root: Path) -> Path:
    return root / "eval" / "sealed" / "hasil.json"


def check_digest(root: Path) -> list[str]:
    """Bandingkan isi set dengan hash yang di-commit sebelum evaluasi."""
    want = {}
    for line in (root / "eval" / "sealed.sha256").read_text(encoding="utf-8").splitlines():
        if line.strip():
            h, name = line.split()
            want[name] = h
    problems = []
    for name in SET_FILES:
        got = hashlib.sha256((root / "eval" / name).read_bytes()).hexdigest()
        if want.get(name) != got:
            problems.append(f"{name} berubah dari hash yang di-commit (eval/sealed.sha256)")
    return problems


def guard(root: Path) -> None:
    """Hentikan bila set tersegel sudah pernah dievaluasi atau isinya berubah."""
    if result_path(root).exists():
        raise SystemExit(
            "set tersegel sudah dievaluasi (eval/sealed/hasil.json). Set ini hanya boleh dipakai "
            "sekali; evaluasi tersegel berikutnya butuh set baru."
        )
    problems = check_digest(root)
    if problems:
        raise SystemExit("\n".join(problems))


def load_rows(root: Path, corpus) -> list[dict]:
    rows = read_questions(root / "eval" / "sealed" / "questions.jsonl")
    problems = validate(rows, corpus, splits=("sealed",))
    if problems:
        raise SystemExit("set tersegel tidak valid:\n" + "\n".join(problems[:20]))
    return rows


def _mean_ci(values: list[float]) -> dict:
    arr = np.asarray(values, dtype=np.float64)
    lo, hi = M.bootstrap_ci(arr, n_boot=2000, seed=0)
    return {"nilai": round(float(arr.mean()), 4), "bawah": round(lo, 4), "atas": round(hi, 4)}


def retrieval(corpus, systems: dict, rows: list[dict], shipped: str) -> dict:
    """Metrik pencarian semua sistem pada pertanyaan terjawab, dan selisih berpasangan metode
    yang dikirim terhadap baseline BM25."""
    ids = [c.id for c in corpus.chunks]
    answerable = [r for r in rows if r["gold"]]
    per: dict[str, list[dict]] = {}
    for key, s in systems.items():
        per[key] = []
        for r in answerable:
            ranked = [ids[i] for i in s.search(r["tanya"], 20)]
            gold = relevant(r)
            per[key].append(
                {
                    "hit@1": M.hit_at_k(ranked, gold, 1),
                    "hit@5": M.hit_at_k(ranked, gold, 5),
                    "recall@10": M.recall_at_k(ranked, set(r["gold"]), 10),
                    "mrr@10": M.reciprocal_rank(ranked, gold, 10),
                }
            )
    out: dict = {"n": len(answerable), "per_sistem": {}, "selisih_berpasangan": {}}
    for key, qs in per.items():
        out["per_sistem"][key] = {
            "label": systems[key].label,
            "situs": systems[key].situs,
            **{m: _mean_ci([q[m] for q in qs]) for m in qs[0]},
        }
    for other in sorted({"bm25_konteks", "bm25_polos"} - {shipped}):
        d = {}
        for m in ("hit@5", "mrr@10"):
            mean, lo, hi = M.paired_bootstrap_diff(
                np.array([q[m] for q in per[shipped]]),
                np.array([q[m] for q in per[other]]),
                n_boot=2000,
            )
            d[m] = {"selisih": round(mean, 4), "bawah": round(lo, 4), "atas": round(hi, 4)}
        out["selisih_berpasangan"][f"{shipped}_vs_{other}"] = d
    return out


def generative(root: Path, corpus, system, threshold: float, rows: list[dict], ext: list[dict]):
    """Ringkasan generatif per konfigurasi. Menolak bila ada pertanyaan yang belum dibangkitkan
    atau skor NLI yang belum dihitung, supaya hasil sekali jalan ini tidak setengah jadi."""
    from .generation import (
        NliCache,
        _fresh,
        _tanpa_keluaran,
        gen_input,
        judge,
        read_outputs,
        summarize,
    )

    nli = NliCache(root)
    ids = [c.id for c in corpus.chunks]
    gates = {g["id"]: g for g in gen_input(corpus, system, rows, "sealed", threshold)}
    ext_by = {r["id"]: r for r in ext}
    out = {}
    for varian in KONFIGURASI_TERSEGEL:
        by_id = {r["id"]: r for r in read_outputs(root, varian, ("sealed",))}
        for r in rows:  # ditolak gerbang: model tidak dipanggil
            if not gates[r["id"]]["lolos_gerbang"]:
                by_id[r["id"]] = _tanpa_keluaran(r["id"], "sealed")
        missing = [r["id"] for r in rows if not _fresh(by_id.get(r["id"]), gates[r["id"]], ids)]
        if missing:
            raise SystemExit(f"{varian}: {len(missing)} pertanyaan tersegel belum dibangkitkan")
        recs = [judge(by_id[r["id"]], r, gates[r["id"]], ext_by[r["id"]], nli) for r in rows]
        s = summarize(recs)
        if s["nli_belum_dihitung"]:
            raise SystemExit(f"{varian}: {s['nli_belum_dihitung']} skor NLI belum dihitung")
        any_rec = next(r for r in by_id.values() if "model" in r)
        out[varian] = {
            "model": {k: any_rec[k] for k in ("model", "revisi", "dtype")},
            **s,
            "per_pertanyaan": [
                {k: r[k] for k in ("id", "mode", "menolak", "sitasi") if k in r}
                | {"benar": r.get("benar")}
                for r in recs
            ],
        }
    return out


def _git_head(root: Path) -> str | None:
    try:
        res = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True
        )
    except OSError:
        return None
    return res.stdout.strip() or None


def run(root: Path) -> dict:
    from .corpus import Corpus
    from .evalrag import _sha, answer_all, build_systems, summarize_answers

    guard(root)
    corpus_path = root / "corpus" / "korpus.json"
    locked = json.loads((root / "eval" / "results.json").read_text(encoding="utf-8"))
    if locked["korpus"]["sha256"] != _sha(corpus_path):
        raise SystemExit("eval/results.json dibuat dari korpus lain; jalankan `evidence eval`.")
    corpus = Corpus.read(corpus_path)
    rows = load_rows(root, corpus)
    systems = build_systems(corpus, root)
    key = locked["metode_dikirim"]
    threshold = locked["ambang"]["terpilih"]
    shipped = systems[key]
    ext = answer_all(corpus, shipped, rows, threshold)
    return {
        "versi": 1,
        "waktu_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commit": _git_head(root),
        "aturan": (
            "Dijalankan sekali setelah desain dibekukan. Metode, ambang, prompt, dan model "
            "diambil dari eval/results.json; tidak ada yang dipilih atau disetel dari set ini."
        ),
        "set": {
            "sha256": {n: _sha(root / "eval" / n) for n in SET_FILES},
            "pertanyaan": len(rows),
            "terjawab": sum(bool(r["gold"]) for r in rows),
            "tak_terjawab": sum(not r["gold"] for r in rows),
        },
        "terkunci": {
            "korpus_sha256": locked["korpus"]["sha256"],
            "hasil_sha256": _sha(root / "eval" / "results.json"),
            "metode": key,
            "ambang": threshold,
        },
        "pencarian": retrieval(corpus, systems, rows, key),
        "ekstraktif": summarize_answers(ext),
        "generatif": generative(
            root, corpus, systems[generation.SISTEM_GENERATIF], threshold, rows, ext
        ),
    }
