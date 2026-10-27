"""Holdout v2: dijalankan SEKALI, setelah alur v2 dibekukan dan pemilik proyek menyetujui.

Protokol: docs/penilaian-v2.md bagian 3. Set eval/holdout-v2/questions.jsonl ditulis agen terpisah;
hash-nya di-commit sebelum evaluasi (eval/holdout-v2.sha256). Modul ini:

- menolak bila isi set berubah dari hash atau hasil sudah ada (eval/holdout-v2/hasil.json adalah
  penanda sekali jalan);
- menghitung skor reranker untuk pertanyaan holdout (kandidat BM25 dengan konteks), dengan model
  dan revisi yang sama dengan cache evaluasi;
- menulis masukan generator alur v1 dan v2;
- merangkum alur v1, alur v2, dan kutipan langsung bawaan dengan penilaian v1 dan v2, lalu
  memeriksa kriteria lolos yang sudah dibekukan (penilaian.KRITERIA).

Alur workflow .github/workflows/holdout-v2.yml: `holdout rerank` -> `holdout input` (v1, v2) ->
generate-server.mjs (v1, lalu v2 dengan salinan prompt identik) -> `gen-merge` -> `nli` ->
`holdout run`.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from . import generation as G
from .evalset import read_questions, validate
from .penilaian import KRITERIA, VERSI, periksa_kriteria

SET = "holdout-v2"
BERKAS = "holdout-v2/questions.jsonl"


def result_path(root: Path) -> Path:
    return root / "eval" / "holdout-v2" / "hasil.json"


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def guard(root: Path) -> None:
    if result_path(root).exists():
        raise SystemExit(
            "holdout v2 sudah dievaluasi (eval/holdout-v2/hasil.json). Set ini hanya boleh dipakai "
            "sekali; evaluasi generalisasi berikutnya butuh set baru."
        )
    want, name = (root / "eval" / "holdout-v2.sha256").read_text(encoding="utf-8").split()
    if name != BERKAS or _sha(root / "eval" / name) != want:
        raise SystemExit(f"{BERKAS} berubah dari hash yang di-commit (eval/holdout-v2.sha256)")


def load_rows(root: Path, corpus) -> list[dict]:
    rows = read_questions(root / "eval" / BERKAS)
    problems = validate(rows, corpus, splits=(SET,))
    if problems:
        raise SystemExit("holdout v2 tidak valid:\n" + "\n".join(problems[:20]))
    return rows


def rerank(root: Path) -> int:
    """Skor mMiniLM untuk pertanyaan holdout, digabung ke cache tanpa mengubah skor lama."""
    from .corpus import Corpus
    from .dense import text_key
    from .evalrag import build_systems, corpus_sha
    from .rerank import POOL, cache_path, score_and_cache

    guard(root)
    corpus = Corpus.read(root / "corpus" / "korpus.json")
    rows = load_rows(root, corpus)
    bm = build_systems(corpus, root)["bm25_konteks"]
    queries = {text_key(r["tanya"]): r["tanya"] for r in rows}
    pairs = {qk: sorted(int(i) for i in bm.search(q, POOL)) for qk, q in queries.items()}
    passages = [corpus.index_text(i) for i in range(len(corpus.chunks))]
    ids = [c.id for c in corpus.chunks]
    tmp = root / "eval" / "cache" / "rerank" / "mminilm" / "holdout-v2.tmp.json"
    score_and_cache("mminilm", pairs, queries, passages, ids, tmp, corpus_sha(corpus))
    baru = json.loads(tmp.read_text(encoding="utf-8"))
    tmp.unlink()
    path = cache_path(root, "mminilm")
    lama = json.loads(path.read_text(encoding="utf-8"))
    for k in ("model", "revisi", "korpus_sha256"):
        if lama[k] != baru[k]:
            raise SystemExit(f"cache reranker: {k} berbeda")
    tumpang = set(lama["skor"]) & set(baru["skor"])
    lama["skor"].update({k: v for k, v in baru["skor"].items() if k not in tumpang})
    path.write_text(json.dumps(lama, ensure_ascii=False) + "\n", encoding="utf-8")
    return len(baru["skor"]) - len(tumpang)


def make_input(root: Path, alur: str) -> list[dict]:
    from .cli import _generative

    guard(root)
    corpus, system, threshold = _generative()
    rows = load_rows(root, corpus)
    return G.gen_input(corpus, system, rows, SET, threshold, alur)


SET_LAIN = ("questions.jsonl", "stress.jsonl", "sealed/questions.jsonl", "sealed/injeksi.jsonl")


def duplikat(root: Path, rows: list[dict]) -> set[str]:
    """Id pertanyaan holdout yang teksnya identik dengan pertanyaan di set evaluasi lain."""
    lain: set[str] = set()
    for rel in SET_LAIN:
        p = root / "eval" / rel
        if p.exists():
            lain |= {r["tanya"].strip() for r in read_questions(p)}
    return {r["id"] for r in rows if r["tanya"].strip() in lain}


def _git_head(root: Path) -> str | None:
    import subprocess

    try:
        res = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"], capture_output=True, text=True
        )
    except OSError:
        return None
    return res.stdout.strip() or None


def run(root: Path) -> dict:
    from . import alur_v2
    from .corpus import Corpus
    from .evalrag import build_systems

    guard(root)
    corpus = Corpus.read(root / "corpus" / "korpus.json")
    rows = load_rows(root, corpus)
    locked = json.loads((root / "eval" / "results.json").read_text(encoding="utf-8"))
    thr, metode = locked["ambang"]["terpilih"], locked["metode_dikirim"]
    systems = build_systems(corpus, root)
    h = {a: alur_v2.rekam(root, corpus, systems, metode, thr, SET, a) for a in ("v1", "v2")}
    for a, x in h.items():
        if x["belum_dibangkitkan"]:
            raise SystemExit(f"alur {a}: {len(x['belum_dibangkitkan'])} keluaran belum ada")
    ring = {a: alur_v2.ringkas(x["rekaman"]) for a, x in h.items()}
    # Uji sensitivitas yang ditetapkan sebelum run (preflight 27 Okt): pertanyaan yang teksnya
    # identik dengan set lain (kebetulan; penulis tidak melihat set itu) dikeluarkan. Angka utama
    # dan kriteria tetap memakai seluruh 120 pertanyaan sesuai protokol.
    dup = duplikat(root, rows)
    tanpa_dup = {
        a: alur_v2.ringkas([r for r in x["rekaman"] if r["id"] not in dup]) for a, x in h.items()
    }
    v2 = ring["v2"]
    kriteria = periksa_kriteria(
        {
            "generatif_benar": v2["benar_v2"]["nilai"],
            "kutipan_benar": v2["kutipan_bawaan_benar_v2"]["nilai"],
            "tak_terjawab_keliru": v2["tak_terjawab_keliru_v2"]["nilai"],
            "sitasi_semua_sah": v2["sitasi_semua_sah"]["nilai"],
            "kalimat_tanpa_sitasi_tampil": v2["kalimat_tanpa_sitasi_tampil"],
        }
    )
    return {
        "versi": 1,
        "waktu_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commit": _git_head(root),
        "aturan": (
            "Dijalankan sekali setelah alur v2 dibekukan dan disetujui pemilik proyek. Penilaian "
            f"{VERSI} dan kriteria lolos dibekukan sebelum set ini ditulis (docs/penilaian-v2.md)."
        ),
        "set": {
            "sha256": _sha(root / "eval" / BERKAS),
            "pertanyaan": len(rows),
            "terjawab": sum(bool(r["gold"]) for r in rows),
            "tak_terjawab": sum(not r["gold"] for r in rows),
        },
        "terkunci": {
            "metode_kutipan": metode,
            "ambang_bm25": thr,
            "ambang_reranker": G.AMBANG_RERANKER,
        },
        "alur_v1": ring["v1"],
        "alur_v2": ring["v2"],
        "kriteria": {"ambang": KRITERIA, "hasil": kriteria},
        "sensitivitas_tanpa_duplikat": {"dikeluarkan": sorted(dup), **tanpa_dup},
        "perbandingan": alur_v2.bandingkan(h["v1"], h["v2"]),
        "rekaman": {a: x["rekaman"] for a, x in h.items()},
    }
