"""Satu pintu untuk semua metode pencarian yang dievaluasi dan diekspor ke website."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .bm25 import BM25
from .fusion import rank_order, rrf
from .lsa import LSA
from .text import tokenize

METHODS = ("bm25", "lsa", "hybrid")


@dataclass
class Retriever:
    chunk_texts: list[str]
    use_stem: bool = True
    k1: float = 1.2
    b: float = 0.75
    lsa_dim: int = 128
    rrf_k: int = 60

    def __post_init__(self) -> None:
        self.tokens = [tokenize(t, use_stem=self.use_stem) for t in self.chunk_texts]
        self.bm25 = BM25(self.tokens, k1=self.k1, b=self.b)
        self.lsa = LSA(self.tokens, dim=self.lsa_dim)

    def query_tokens(self, query: str) -> list[str]:
        return tokenize(query, use_stem=self.use_stem)

    def scores(self, query: str, method: str) -> np.ndarray:
        q = self.query_tokens(query)
        if method == "bm25":
            return self.bm25.scores(q)
        if method == "lsa":
            return self.lsa.scores(q)
        if method == "hybrid":
            return rrf([self.bm25.scores(q), self.lsa.scores(q)], k=self.rrf_k)
        raise ValueError(f"metode tidak dikenal: {method}")

    def search(self, query: str, method: str = "hybrid", k: int = 10) -> list[int]:
        return [int(i) for i in rank_order(self.scores(query, method))[:k]]
