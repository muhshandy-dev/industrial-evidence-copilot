"""BM25 Okapi (idf gaya Lucene) tanpa dependensi selain numpy.

Versi JavaScript di web/public/js/retrieval.js menghitung rumus yang sama; paritasnya
diuji dengan tests/ (Python) dan web/tests/retrieval.test.mjs (JavaScript).
"""

from __future__ import annotations

import math
from collections import Counter

import numpy as np


class BM25:
    def __init__(self, docs: list[list[str]], k1: float = 1.2, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.n_docs = len(docs)
        self.doc_len = np.array([len(d) for d in docs], dtype=np.float64)
        self.avg_len = float(self.doc_len.mean()) if self.n_docs else 0.0
        postings: dict[str, list[tuple[int, int]]] = {}
        for i, doc in enumerate(docs):
            for term, tf in Counter(doc).items():
                postings.setdefault(term, []).append((i, tf))
        self.postings = postings
        self.idf = {
            t: round(math.log(1.0 + (self.n_docs - len(p) + 0.5) / (len(p) + 0.5)), 6)
            for t, p in postings.items()
        }

    def scores(self, query: list[str]) -> np.ndarray:
        out = np.zeros(self.n_docs, dtype=np.float64)
        for term in dict.fromkeys(query):  # istilah unik, urutan tetap
            plist = self.postings.get(term)
            if not plist:
                continue
            idf = self.idf[term]
            for i, tf in plist:
                norm = 1.0 - self.b + self.b * self.doc_len[i] / self.avg_len
                out[i] += idf * tf * (self.k1 + 1.0) / (tf + self.k1 * norm)
        return out
