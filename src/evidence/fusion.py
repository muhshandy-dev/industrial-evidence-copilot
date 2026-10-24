"""Penggabungan peringkat dan utilitas peringkat."""

from __future__ import annotations

import numpy as np


def rank_order(scores: np.ndarray) -> np.ndarray:
    """Indeks dokumen dari skor tertinggi. Skor sama diurutkan menurut indeks naik."""
    return np.lexsort((np.arange(len(scores)), -scores))


def rrf(
    score_lists: list[np.ndarray], k: int = 60, weights: list[float] | None = None
) -> np.ndarray:
    """Reciprocal Rank Fusion. Dokumen dengan skor 0 di semua daftar tetap mendapat skor kecil."""
    weights = weights or [1.0] * len(score_lists)
    out = np.zeros(len(score_lists[0]), dtype=np.float64)
    for w, s in zip(weights, score_lists, strict=True):
        order = rank_order(s)
        ranks = np.empty(len(s), dtype=np.int64)
        ranks[order] = np.arange(1, len(s) + 1)
        out += w / (k + ranks)
    return out
