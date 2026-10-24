"""Metrik peringkat dan interval kepercayaan bootstrap. Semua relevansi biner."""

from __future__ import annotations

import math

import numpy as np


def recall_at_k(ranked: list[str], gold: set[str], k: int) -> float:
    """Porsi bukti emas yang ada di k teratas."""
    return len(gold & set(ranked[:k])) / len(gold)


def hit_at_k(ranked: list[str], gold: set[str], k: int) -> float:
    """1 bila ada satu saja bukti emas di k teratas."""
    return float(bool(gold & set(ranked[:k])))


def reciprocal_rank(ranked: list[str], gold: set[str], k: int = 10) -> float:
    for i, c in enumerate(ranked[:k], start=1):
        if c in gold:
            return 1.0 / i
    return 0.0


def ndcg_at_k(ranked: list[str], gold: set[str], k: int = 10) -> float:
    """nDCG untuk relevansi "salah satu cukup": satu pasal sah sudah menjawab pertanyaan, jadi
    idealnya satu bukti di peringkat 1 (IDCG = 1). Bukti sah tambahan tidak menurunkan nilai."""
    for i, c in enumerate(ranked[:k], start=1):
        if c in gold:
            return 1.0 / math.log2(i + 1)
    return 0.0


def bootstrap_ci(
    values: np.ndarray, *, n_boot: int = 2000, alpha: float = 0.05, seed: int = 0
) -> tuple[float, float]:
    """Interval persentil atas rata-rata, resampling per pertanyaan."""
    values = np.asarray(values, dtype=np.float64)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(values), size=(n_boot, len(values)))
    means = values[idx].mean(axis=1)
    return float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2))


def paired_bootstrap_diff(
    a: np.ndarray, b: np.ndarray, *, n_boot: int = 2000, alpha: float = 0.05, seed: int = 0
) -> tuple[float, float, float]:
    """Selisih rata-rata a - b dengan interval; pertanyaan yang sama dipasangkan."""
    d = np.asarray(a, dtype=np.float64) - np.asarray(b, dtype=np.float64)
    lo, hi = bootstrap_ci(d, n_boot=n_boot, alpha=alpha, seed=seed)
    return float(d.mean()), lo, hi


def wilson_ci(successes: int, n: int, *, z: float = 1.959964) -> tuple[float, float]:
    """Interval Wilson untuk proporsi. Tetap bermakna saat hasilnya 0 atau n, tidak seperti
    bootstrap persentil yang jatuh ke selang selebar nol."""
    if n == 0:
        return 0.0, 1.0
    p = successes / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)
