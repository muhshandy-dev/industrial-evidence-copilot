"""Reranker cross-encoder: menilai ulang pasangan (pertanyaan, pasal) untuk kandidat teratas.

Sama seperti embedding, skor dihitung sekali di GitHub Actions (`evidence rerank`) dan
disimpan di eval/cache/rerank/<kunci>/skor.json, lalu evaluasi hanya membaca cache.
Kandidat yang dinilai adalah gabungan POOL teratas dari BM25 dan setiap model embedding,
sehingga sistem tahap pertama mana pun dapat di-rerank dari cache yang sama.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .dense import text_key

# kunci -> (repo, revisi, layak di peramban)
RERANKERS: dict[str, tuple[str, str, bool]] = {
    "mminilm": (
        "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
        "1427fd652930e4ba29e8149678df786c240d8825",
        True,
    ),
    "bge_m3": ("BAAI/bge-reranker-v2-m3", "953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e", False),
    # Versi 8-bit mMiniLM (onnx/model_quint8_avx2.onnx di repositori yang sama). Skornya dihitung
    # dengan kode situs (web/scripts/skor-rerank.mjs), bukan dengan `evidence rerank`.
    "mminilm_q8": (
        "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
        "1427fd652930e4ba29e8149678df786c240d8825",
        True,
    ),
}
DARI_JS = {"mminilm_q8"}
POOL = 30  # kandidat per sistem tahap pertama yang dimasukkan ke pool
TOP = 20  # yang di-rerank saat evaluasi


def cache_path(root: Path, key: str) -> Path:
    return root / "eval" / "cache" / "rerank" / key / "skor.json"


def score_and_cache(
    key: str, pairs: dict[str, list[int]], queries: dict[str, str], passages: list[str],
    ids: list[str], out: Path, corpus_sha: str,
) -> None:  # fmt: skip
    """pairs: kunci pertanyaan -> indeks pasal kandidat. queries: kunci -> teks pertanyaan."""
    from sentence_transformers import CrossEncoder  # dependensi opsional [model]

    repo, rev, _ = RERANKERS[key]
    model = CrossEncoder(repo, revision=rev, device="cpu", max_length=512)
    flat = [(qk, ci) for qk, cands in pairs.items() for ci in cands]
    scores = model.predict(
        [(queries[qk], passages[ci]) for qk, ci in flat], batch_size=16, show_progress_bar=False
    )
    table: dict[str, dict[str, float]] = {}
    for (qk, ci), s in zip(flat, scores, strict=True):
        table.setdefault(qk, {})[ids[ci]] = round(float(s), 5)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {"model": repo, "revisi": rev, "korpus_sha256": corpus_sha, "skor": table}
    out.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")


class RerankCache:
    def __init__(self, root: Path, key: str, corpus_sha: str, ids: list[str]) -> None:
        raw = json.loads(cache_path(root, key).read_text(encoding="utf-8"))
        if raw["korpus_sha256"] != corpus_sha:
            raise SystemExit(f"cache reranker {key} dari korpus lain; jalankan `evidence rerank`")
        self.key = key
        self.meta = {k: raw[k] for k in ("model", "revisi")}
        self.ids = ids
        self.table = raw["skor"]
        self.missing = 0  # kandidat yang tidak ada di cache (dilaporkan)

    @classmethod
    def load(cls, root: Path, key: str, corpus_sha: str, ids: list[str]) -> RerankCache | None:
        if not cache_path(root, key).exists():
            return None
        return cls(root, key, corpus_sha, ids)

    def apply(self, query: str, first_stage: np.ndarray) -> np.ndarray:
        """Urutkan ulang TOP kandidat tahap pertama menurut skor cross-encoder; sisanya tetap
        di bawahnya dengan urutan asal."""
        from .fusion import rank_order

        table = self.table.get(text_key(query), {})
        top = rank_order(first_stage)[:TOP]
        out = first_stage.astype(np.float64) - float(first_stage.max()) - 1.0
        for rank, ci in enumerate(top):
            s = table.get(self.ids[ci])
            if s is None:
                self.missing += 1
                s = -1e3 - rank  # tanpa skor: tetap di bawah yang dinilai, urutan asal dijaga
            out[ci] = 1e6 + s
        return out
