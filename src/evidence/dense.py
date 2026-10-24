"""Pencarian padat dengan embedding pra-latih (sentence-transformers) dan indeks FAISS.

Dua tahap, supaya evaluasi dapat diulang tanpa mengunduh model:

1. `evidence embed` memuat model dari Hugging Face (revisi dipatok) dan menulis embedding
   pasal serta pertanyaan ke eval/cache/emb/<kunci>/. Tahap ini butuh internet dan dijalankan
   di GitHub Actions (workflow "Model").
2. Evaluasi membaca cache itu dan mencari lewat indeks FAISS (inner product atas vektor
   ternormalisasi, yaitu kemiripan kosinus).

Model e5 memakai awalan "query: " dan "passage: " seperti dianjurkan pembuatnya. Teks pasal
memakai chunk kontekstual yang sama dengan BM25 (judul dokumen, subjek, bab, isi).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

# kunci -> (repo Hugging Face, revisi, dimensi, layak dijalankan di peramban)
MODELS: dict[str, tuple[str, str, int, bool]] = {
    "e5_small": (
        "intfloat/multilingual-e5-small",
        "614241f622f53c4eeff9890bdc4f31cfecc418b3",
        384,
        True,
    ),
    "e5_base": (
        "intfloat/multilingual-e5-base",
        "d128750597153bb5987e10b1c3493a34e5a4502a",
        768,
        True,
    ),
    "e5_large": (
        "intfloat/multilingual-e5-large",
        "3d7cfbdacd47fdda877c5cd8a79fbcc4f2a574f3",
        1024,
        False,
    ),
}
MAX_SEQ = 512


def text_key(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def cache_dir(root: Path, key: str) -> Path:
    return root / "eval" / "cache" / "emb" / key


def encode_and_cache(
    key: str, passages: list[str], queries: list[str], out: Path, corpus_sha: str
) -> dict:
    """Hitung embedding dengan sentence-transformers lalu simpan (float16, ternormalisasi)."""
    import sentence_transformers as st  # dependensi opsional [model]
    import torch

    repo, rev, dim, _ = MODELS[key]
    model = st.SentenceTransformer(repo, revision=rev, device="cpu")
    model.max_seq_length = MAX_SEQ
    torch.manual_seed(0)
    kw = dict(batch_size=16, normalize_embeddings=True, convert_to_numpy=True)
    p = model.encode([f"passage: {t}" for t in passages], **kw)
    uniq = list(dict.fromkeys(queries))
    q = model.encode([f"query: {t}" for t in uniq], **kw)
    assert p.shape[1] == dim
    out.mkdir(parents=True, exist_ok=True)
    np.save(out / "pasal.npy", p.astype(np.float16))
    np.save(out / "pertanyaan.npy", q.astype(np.float16))
    meta = {
        "model": repo,
        "revisi": rev,
        "dimensi": dim,
        "korpus_sha256": corpus_sha,
        "pasal": len(passages),
        "pertanyaan": [text_key(t) for t in uniq],
        "sentence_transformers": st.__version__,
        "torch": torch.__version__,
        "max_seq": MAX_SEQ,
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    return meta


@dataclass
class DenseIndex:
    """Indeks FAISS atas embedding pasal dari cache; pertanyaan dicari lewat embedding cache."""

    key: str
    passages: np.ndarray
    queries: dict[str, np.ndarray]
    meta: dict

    def __post_init__(self) -> None:
        import faiss

        self.index = faiss.IndexFlatIP(self.passages.shape[1])
        self.index.add(np.ascontiguousarray(self.passages, dtype=np.float32))

    @classmethod
    def load(cls, root: Path, key: str, corpus_sha: str) -> DenseIndex | None:
        d = cache_dir(root, key)
        if not (d / "meta.json").exists():
            return None
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        if meta["korpus_sha256"] != corpus_sha:
            raise SystemExit(f"cache embedding {key} dari korpus lain; jalankan `evidence embed`")
        p = np.load(d / "pasal.npy").astype(np.float32)
        q = np.load(d / "pertanyaan.npy").astype(np.float32)
        return cls(key, p, dict(zip(meta["pertanyaan"], q, strict=True)), meta)

    def has(self, query: str) -> bool:
        return text_key(query) in self.queries

    def scores(self, query: str) -> np.ndarray:
        """Kemiripan kosinus pertanyaan terhadap semua pasal, lewat pencarian FAISS penuh."""
        vec = self.queries.get(text_key(query))
        if vec is None:
            raise KeyError(
                f"pertanyaan belum punya embedding {self.key}; jalankan `evidence embed`"
            )
        n = self.index.ntotal
        sims, idx = self.index.search(vec[None, :], n)
        out = np.empty(n, dtype=np.float64)
        out[idx[0]] = sims[0]
        return out
