"""Evaluasi tahap generatif (RAG): masukan generator, groundedness NLI, dan ringkasan metrik.

Alur, dengan pola dua tahap yang sama seperti embedding:

1. `evidence gen-input` menulis, untuk setiap pertanyaan, peringkat pasal dari metode pencarian
   yang dikirim beserta keputusan gerbang penolakan.
2. web/scripts/generate.mjs (Node, transformers.js) menjalankan model generatif yang sama dengan
   situs, dengan prompt dari web/public/js/gen/prompt.js, dan menulis keluaran mentah ke
   eval/cache/gen/<varian>/<set>.jsonl.
3. web/scripts/baca-gen.mjs membaca sitasi [n] dan menjalankan pemeriksaan pascagenerasi dengan
   kode situs.
4. `evidence nli` menilai setiap kalimat jawaban terhadap pasal yang dikutipnya dengan model NLI
   multibahasa (entailment) dan menyimpan skornya di eval/cache/nli/skor.json.
5. `evidence eval` merangkum semuanya tanpa mengunduh model.

Alur jawaban yang dievaluasi sama dengan situs: gerbang skor pencarian -> generasi -> pembacaan
sitasi -> pemeriksaan. Bila model tidak menghasilkan kalimat bersitasi sah, situs menampilkan
kutipan ekstraktif sebagai cadangan; evaluasi menilai cadangan itu dengan aturan ekstraktif.
"""

from __future__ import annotations

import hashlib
import json
import random
import subprocess
from pathlib import Path

import numpy as np

from .answer import split_units
from .evalset import key_hit, relevant

NLI_MODEL = (
    "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7",
    "b5113eb38ab63efdd7f280f8c144ea8b13f978ce",
)
NLI_AMBANG = 0.5  # peluang entailment minimum agar kalimat dianggap didukung
JENDELA_KARAKTER = 900  # premis NLI: jendela ayat berurutan, supaya muat 512 token
SETS = ("dev", "test", "stress", "injeksi", "sealed")
# Model situs (sama dengan MODEL dan MODEL_CPU di web/public/js/gen/prompt.js; diuji).
MODEL_UTAMA = "onnx-community/Qwen2.5-1.5B-Instruct"  # WebGPU
MODEL_CPU = "onnx-community/Qwen2.5-0.5B-Instruct"  # jalur CPU (WebAssembly)
DTYPE_UTAMA = "q4f16"
# bertahan: prompt situs dengan model utama; polos: pembanding injeksi; bertahan-cpu: model CPU.
KONFIGURASI = ("bertahan", "polos", "bertahan-cpu")


def konfigurasi(varian: str, model: str) -> str:
    return {MODEL_UTAMA: varian, MODEL_CPU: f"{varian}-cpu"}.get(model, f"{varian}-lain")


def gen_dir(root: Path, varian: str) -> Path:
    return root / "eval" / "cache" / "gen" / varian


def nli_path(root: Path) -> Path:
    return root / "eval" / "cache" / "nli" / "skor.json"


def _h(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()[:16]


# ---------- 1. masukan generator ----------


def load_set(root: Path, name: str) -> list[dict]:
    from .evalset import read_questions

    ev = root / "eval"
    if name in ("dev", "test"):
        return [r for r in read_questions(ev / "questions.jsonl") if r["split"] == name]
    path = {
        "stress": ev / "stress.jsonl",
        "injeksi": ev / "sealed" / "injeksi.jsonl",
        "sealed": ev / "sealed" / "questions.jsonl",
    }[name]
    return read_questions(path)


def gen_input(corpus, system, rows: list[dict], set_name: str, threshold: float) -> list[dict]:
    out = []
    for r in rows:
        ranked = system.search(r["tanya"], 10)
        top = float(
            system.retriever.bm25.scores(system.retriever.query_tokens(r["tanya"]))[ranked[0]]
        )
        out.append(
            {
                "id": r["id"],
                "set": set_name,
                "tanya": r["tanya"],
                "peringkat": [int(i) for i in ranked],
                "skor_gerbang": round(top, 4),
                "lolos_gerbang": top >= threshold,
            }
        )
    return out


# ---------- 2-3. keluaran generator, dibaca dengan kode situs ----------


def read_outputs(root: Path, varian: str, sets: tuple[str, ...]) -> list[dict]:
    files = [gen_dir(root, varian) / f"{s}.jsonl" for s in sets]
    files = [f for f in files if f.exists()]
    if not files:
        return []
    res = subprocess.run(
        ["node", str(root / "web" / "scripts" / "baca-gen.mjs"), *map(str, files)],
        check=True,
        capture_output=True,
        text=True,
    )
    return [r for r in json.loads(res.stdout) if not r["basi"]]


# ---------- 4. groundedness dengan NLI ----------


def windows(text: str) -> list[str]:
    """Jendela ayat berurutan sepanjang paling banyak JENDELA_KARAKTER (ayat yang lebih panjang
    tetap satu jendela). Kalimat jawaban dinilai terhadap jendela terbaik."""
    units = split_units(text)
    out: list[str] = []
    for i in range(len(units)):
        w = units[i]
        out.append(w)
        for u in units[i + 1 :]:
            if len(w) + len(u) + 1 > JENDELA_KARAKTER:
                break
            w = f"{w} {u}"
            out.append(w)
    return list(dict.fromkeys(out))


def nli_pairs(parsed: list[dict]) -> list[tuple[str, str]]:
    """Semua pasangan (premis, hipotesis) yang dibutuhkan: setiap kalimat jawaban (sebelum
    pemeriksaan, supaya kalimat yang dibuang juga terukur) terhadap jendela pasal yang dikutip."""
    pairs: list[tuple[str, str]] = []
    for r in parsed:
        for k in r["baca"]["kalimat"]:
            for n in k["sitasi"]:
                for w in windows(r["pasal_teks"][n - 1]):
                    pairs.append((w, k["teks"]))
    return list(dict.fromkeys(pairs))


def score_nli_and_cache(pairs: list[tuple[str, str]], out: Path) -> None:
    """Hitung peluang entailment (butuh internet; dijalankan di GitHub Actions)."""
    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    old = json.loads(out.read_text(encoding="utf-8"))["skor"] if out.exists() else {}
    todo = [(p, h) for p, h in pairs if f"{_h(p)}:{_h(h)}" not in old]
    repo, rev = NLI_MODEL
    tok = AutoTokenizer.from_pretrained(repo, revision=rev)
    model = AutoModelForSequenceClassification.from_pretrained(repo, revision=rev).eval()
    ent = {v.lower(): k for k, v in model.config.id2label.items()}["entailment"]
    with torch.no_grad():
        for i in range(0, len(todo), 16):
            batch = todo[i : i + 16]
            enc = tok(
                [p for p, _ in batch],
                [h for _, h in batch],
                truncation="only_first",
                max_length=512,
                padding=True,
                return_tensors="pt",
            )
            prob = torch.softmax(model(**enc).logits, dim=-1)[:, ent].tolist()
            for (p, h), s in zip(batch, prob, strict=True):
                old[f"{_h(p)}:{_h(h)}"] = round(float(s), 4)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {"model": repo, "revisi": rev, "skor": dict(sorted(old.items()))}
    out.write_text(json.dumps(payload, indent=0) + "\n", encoding="utf-8")


class NliCache:
    def __init__(self, root: Path) -> None:
        p = nli_path(root)
        raw = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"skor": {}}
        self.meta = {k: raw.get(k) for k in ("model", "revisi")}
        self.table: dict[str, float] = raw["skor"]

    def support(self, kalimat: dict, pasal_teks: list[str]) -> float | None:
        """Peluang entailment terbaik untuk kalimat terhadap pasal yang dikutipnya; None bila
        skornya belum dihitung."""
        best = 0.0
        for n in kalimat["sitasi"]:
            for w in windows(pasal_teks[n - 1]):
                s = self.table.get(f"{_h(w)}:{_h(kalimat['teks'])}")
                if s is None:
                    return None
                best = max(best, s)
        return best


# ---------- 5. ringkasan ----------


def _rate(xs: list[bool]) -> dict:
    """Format sama dengan evalrag._rate (proporsi dengan interval Wilson 95%)."""
    from .metrics import wilson_ci

    n = len(xs)
    k = int(sum(xs))
    lo, hi = wilson_ci(k, n)
    return {
        "n": n,
        "k": k,
        "nilai": round(k / n, 4) if n else 0.0,
        "bawah": round(lo, 4),
        "atas": round(hi, 4),
    }


def judge(r: dict, row: dict, gate: dict, extractive: dict | None, nli: NliCache) -> dict:
    """Satu jawaban akhir menurut alur situs, dinilai dengan aturan yang sama dengan ekstraktif."""
    gold = relevant(row) if "gold" in row else []
    rec = {"id": r["id"], "set": r["set"], "terjawab": bool(gold)}
    if not gate["lolos_gerbang"]:
        rec["mode"] = "tolak_gerbang"
    elif r["periksa"]["status"] == "tolak":
        rec["mode"] = "tolak_model"
    elif r["periksa"]["status"] == "tanpa_dasar":
        rec["mode"] = "cadangan_ekstraktif"
    else:
        rec["mode"] = "generatif"
    rec["menolak"] = rec["mode"].startswith("tolak") or (
        rec["mode"] == "cadangan_ekstraktif" and (extractive is None or extractive["menolak"])
    )
    # Kalimat mentah (sebelum pemeriksaan) dan yang ditampilkan.
    support_raw = [nli.support(k, r["pasal_teks"]) for k in r["baca"]["kalimat"] if k["sitasi"]]
    shown = r["periksa"]["kalimat"] if rec["mode"] == "generatif" else []
    support = [nli.support(k, r["pasal_teks"]) for k in shown]
    rec["kalimat"] = len(shown)
    rec["didukung"] = [None if s is None else s >= NLI_AMBANG for s in support]
    rec["didukung_mentah"] = [None if s is None else s >= NLI_AMBANG for s in support_raw]
    rec["tanpa_sitasi_mentah"] = r["baca"]["tanpaSitasi"]
    rec["sitasi_tidak_sah"] = r["baca"]["sitasiTidakSah"]
    cited = sorted({r["pasal"][n - 1] for k in shown for n in k["sitasi"]})
    rec["sitasi"] = cited
    if gold and rec["mode"] == "generatif":
        teks = " ".join(k["teks"] for k in shown)
        rec["sitasi_ada_yang_sah"] = bool(set(cited) & set(gold))
        rec["sitasi_semua_sah"] = bool(cited) and set(cited) <= set(gold)
        rec["kunci_ada"] = key_hit(row["kunci"], teks)
        rec["benar"] = rec["sitasi_ada_yang_sah"] and rec["kunci_ada"]
    elif gold and rec["mode"] == "cadangan_ekstraktif" and extractive is not None:
        rec["benar"] = bool(extractive.get("benar"))
    elif gold:
        rec["benar"] = False
    rec["detik"] = r.get("detik")
    rec["token_keluar"] = r.get("token_keluar")
    return rec


def summarize(recs: list[dict]) -> dict:
    ans = [r for r in recs if r["terjawab"]]
    una = [r for r in recs if not r["terjawab"]]
    gen = [r for r in recs if r["mode"] == "generatif"]
    sent = [s for r in gen for s in r["didukung"] if s is not None]
    sent_raw = [s for r in recs for s in r["didukung_mentah"] if s is not None]
    modes: dict[str, int] = {}
    for r in recs:
        modes[r["mode"]] = modes.get(r["mode"], 0) + 1
    ans_gen = [r for r in ans if r["mode"] == "generatif"]
    out = {
        "n": len(recs),
        "mode": modes,
        "jawaban_benar": _rate([r["benar"] for r in ans]),
        "dijawab_padahal_tak_terjawab": _rate([not r["menolak"] for r in una]),
        "menolak_padahal_terjawab": _rate([r["menolak"] for r in ans]),
        "sitasi_ada_yang_sah": _rate([r["sitasi_ada_yang_sah"] for r in ans_gen]),
        "sitasi_semua_sah": _rate([r["sitasi_semua_sah"] for r in ans_gen]),
        "kalimat_didukung": _rate(sent),
        "jawaban_seluruhnya_didukung": _rate(
            [all(r["didukung"]) for r in gen if r["didukung"] and None not in r["didukung"]]
        ),
        "kalimat_didukung_sebelum_pemeriksaan": _rate(sent_raw),
        "jawaban_dengan_kalimat_tanpa_sitasi": _rate([r["tanpa_sitasi_mentah"] > 0 for r in recs]),
        "nli_belum_dihitung": sum(
            1 for r in recs for s in r["didukung"] + r["didukung_mentah"] if s is None
        ),
    }
    secs = [r["detik"] for r in recs if r.get("detik")]
    if secs:
        out["detik_per_jawaban_cpu"] = {
            "median": round(float(np.median(secs)), 1),
            "p90": round(float(np.percentile(secs, 90)), 1),
        }
    return out


def manual_sample(recs: list[dict], parsed: dict[str, dict], n: int = 40, seed: int = 7) -> list:
    """Sampel kalimat untuk validasi manual penilai NLI: separuh didukung, separuh tidak."""
    items = []
    for r in recs:
        if r["mode"] != "generatif":
            continue
        p = parsed[r["id"]]
        for k, s in zip(p["periksa"]["kalimat"], r["didukung"], strict=True):
            if s is not None:
                items.append({"id": r["id"], "kalimat": k["teks"], "sitasi": k["sitasi"], "nli": s})
    rng = random.Random(seed)
    pos = [x for x in items if x["nli"]]
    neg = [x for x in items if not x["nli"]]
    rng.shuffle(pos)
    rng.shuffle(neg)
    take_neg = neg[: n // 2]
    return sorted(pos[: n - len(take_neg)] + take_neg, key=lambda x: x["id"])


def _fresh(g: dict | None, gate: dict, ids: list[str]) -> bool:
    """Keluaran dihitung dari peringkat pasal yang sama dengan pencarian saat ini."""
    return g is not None and g["pasal"] == [ids[i] for i in gate["peringkat"][: len(g["pasal"])]]


def evaluate(root: Path, corpus, system, threshold: float, rows: list[dict], ext: list[dict]):
    """Bagian "generatif" pada eval/results.json; None bila belum ada keluaran generator.
    Set tersegel tidak pernah ikut di sini (lihat `evidence eval-sealed`)."""
    from .evalrag import answer_all

    sets = ("dev", "test", "stress", "injeksi")
    out: dict = {
        "model": None,
        "penilai_nli": {"model": NLI_MODEL[0], "revisi": NLI_MODEL[1], "ambang": NLI_AMBANG},
    }
    nli = NliCache(root)
    any_output = False
    for varian in KONFIGURASI:
        parsed = read_outputs(root, varian, sets)
        if not parsed:
            continue
        any_output = True
        by_id = {r["id"]: r for r in parsed}
        res: dict = {}
        for s in sets:
            srows = load_set(root, s)
            if not any(r["id"] in by_id for r in srows):
                continue
            gates = {g["id"]: g for g in gen_input(corpus, system, srows, s, threshold)}
            if s in ("dev", "test"):
                ext_by = {r["id"]: r for r in ext}
            else:
                filled = [{"split": s, "gaya": "-", "gold": [], "kunci": [], **r} for r in srows]
                ext_by = {r["id"]: r for r in answer_all(corpus, system, filled, threshold)}
            ids = [c.id for c in corpus.chunks]

            recs = [
                judge(by_id[r["id"]], r, gates[r["id"]], ext_by.get(r["id"]), nli)
                for r in srows
                if _fresh(by_id.get(r["id"]), gates[r["id"]], ids)
            ]
            missing = len(srows) - len(recs)
            res[s] = {**summarize(recs), "belum_dibangkitkan": missing}
            if s == "injeksi":
                res[s]["per_butir"] = [
                    {
                        "id": r["id"],
                        "mode": r["mode"],
                        "kalimat": [k["teks"] for k in by_id[r["id"]]["periksa"]["kalimat"]],
                        "mentah": by_id[r["id"]]["mentah"],
                    }
                    for r in recs
                ]
            if s == "test" and varian == "bertahan":
                res["sampel_validasi_manual"] = manual_sample(recs, by_id)
        out[varian] = res
        out.setdefault("model_per_konfigurasi", {})[varian] = {
            k: parsed[0][k] for k in ("model", "revisi", "dtype")
        }
        if varian == "bertahan":
            out["model"] = {k: parsed[0][k] for k in ("model", "revisi", "dtype")}
    return out if any_output else None
