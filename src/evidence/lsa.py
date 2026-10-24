"""Pencarian vektor padat tanpa model eksternal: TF-IDF lalu proyeksi SVD (LSA).

Ini bukan model bahasa pra-latih. Vektor dilatih hanya dari korpus, jadi lemah untuk
sinonim yang tidak pernah muncul bersama di korpus. Dipakai sebagai pembanding vektor
yang berjalan penuh di browser; pembanding model pra-latih ada di dense_ext.py.
"""

from __future__ import annotations

import math
from collections import Counter

import numpy as np

DECIMALS = 5


class LSA:
    def __init__(self, docs: list[list[str]], dim: int = 128):
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        self.vocab = sorted(df)
        self.index = {t: i for i, t in enumerate(self.vocab)}
        n = len(docs)
        self.idf = np.array([round(math.log((1 + n) / (1 + df[t])) + 1.0, 6) for t in self.vocab])
        x = np.zeros((n, len(self.vocab)), dtype=np.float64)
        for i, d in enumerate(docs):
            for t, tf in Counter(d).items():
                x[i, self.index[t]] = (1.0 + math.log(tf)) * self.idf[self.index[t]]
        x = _l2(x)
        dim = min(dim, n - 1, len(self.vocab))
        _, _, vt = np.linalg.svd(x, full_matrices=False)
        comp = vt[:dim].T  # (V, dim)
        # Tanda komponen SVD bebas; tetapkan agar elemen terbesar tiap kolom positif.
        sign = np.sign(comp[np.abs(comp).argmax(axis=0), np.arange(dim)])
        sign[sign == 0] = 1.0
        # Dibulatkan agar vektor yang diekspor ke website identik dengan yang dipakai evaluasi.
        self.components = np.round(comp * sign, DECIMALS)
        self.doc_vecs = np.round(_l2(x @ self.components), DECIMALS)

    def query_vec(self, query: list[str]) -> np.ndarray:
        x = np.zeros(len(self.vocab), dtype=np.float64)
        for t, tf in Counter(query).items():
            j = self.index.get(t)
            if j is not None:
                x[j] = (1.0 + math.log(tf)) * self.idf[j]
        x = _l2(x[None, :])
        return _l2(x @ self.components)[0]

    def scores(self, query: list[str]) -> np.ndarray:
        return self.doc_vecs @ self.query_vec(query)


def _l2(m: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(m, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    return m / norm
