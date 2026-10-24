"""Ekspor indeks pencarian ke JSON statis untuk website (BM25 + LSA, tanpa server)."""

from __future__ import annotations

import json
from pathlib import Path

from .retriever import Retriever


def build_index(r: Retriever, *, include_lsa: bool = False) -> dict:
    bm = r.bm25
    terms = {}
    for term in sorted(bm.postings):
        plist = bm.postings[term]
        terms[term] = [bm.idf[term], [d for d, _ in plist], [tf for _, tf in plist]]
    index = {
        "versi": 1,
        "pakai_stem": r.use_stem,
        "n": bm.n_docs,
        "k1": bm.k1,
        "b": bm.b,
        "panjang_dokumen": [int(x) for x in bm.doc_len],
        "rata_panjang": round(bm.avg_len, 6),
        "bm25": terms,
    }
    if include_lsa:
        lsa = r.lsa
        index["lsa"] = {
            "dim": int(lsa.components.shape[1]),
            "kosakata": lsa.vocab,
            "idf": [float(x) for x in lsa.idf],
            "komponen": lsa.components.flatten().tolist(),
            "vektor_dokumen": lsa.doc_vecs.flatten().tolist(),
        }
    return index


def write_index(r: Retriever, path: Path, *, include_lsa: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(
        build_index(r, include_lsa=include_lsa), ensure_ascii=False, separators=(",", ":")
    )
    path.write_text(data, encoding="utf-8")
    return len(data.encode("utf-8"))
