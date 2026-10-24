import math

import numpy as np
import pytest

from evidence.bm25 import BM25
from evidence.fusion import rank_order, rrf
from evidence.lsa import LSA
from evidence.metrics import (
    bootstrap_ci,
    hit_at_k,
    ndcg_at_k,
    paired_bootstrap_diff,
    recall_at_k,
    reciprocal_rank,
)

DOCS = [
    ["helm", "lindung", "kepala", "kerja"],
    ["bejana", "tekan", "periksa", "kerja"],
    ["lift", "angkut", "orang", "periksa"],
    ["helm", "helm", "proyek"],
]


def test_bm25_nilai_tangan():
    bm = BM25(DOCS, k1=1.2, b=0.75)
    # istilah "helm": df=2, N=4 -> idf = ln(1 + (4-2+0.5)/(2+0.5)) = ln 2
    idf = math.log(2.0)
    assert bm.idf["helm"] == pytest.approx(idf)
    avg = (4 + 4 + 4 + 3) / 4
    norm0 = 1 - 0.75 + 0.75 * 4 / avg
    expected0 = idf * 1 * 2.2 / (1 + 1.2 * norm0)
    assert bm.scores(["helm"])[0] == pytest.approx(expected0)


def test_bm25_istilah_asing_dan_urutan():
    bm = BM25(DOCS)
    assert bm.scores(["tidakada"]).sum() == 0
    s = bm.scores(["helm", "helm"])  # istilah ganda dihitung sekali
    assert s == pytest.approx(bm.scores(["helm"]))
    assert rank_order(s)[0] == 3  # tf=2 pada dokumen terpendek


def test_rank_order_tie_stabil():
    assert list(rank_order(np.array([1.0, 2.0, 2.0, 0.0]))) == [1, 2, 0, 3]


def test_rrf_menggabungkan():
    a = np.array([3.0, 2.0, 1.0])
    b = np.array([1.0, 2.0, 3.0])
    fused = rrf([a, b], k=60)
    assert fused[0] == pytest.approx(fused[2])
    assert fused[0] > fused[1]  # rata-rata peringkat sama; RRF mengutamakan peringkat tinggi
    assert fused[0] == pytest.approx(1 / 61 + 1 / 63)


def test_lsa_deterministik_dan_relevan():
    l1, l2 = LSA(DOCS, dim=3), LSA(DOCS, dim=3)
    assert np.allclose(l1.doc_vecs, l2.doc_vecs)
    s = l1.scores(["helm", "lindung"])
    assert s[0] > s[2] and s[0] > s[1]
    assert np.allclose(np.linalg.norm(l1.doc_vecs, axis=1), 1.0)


def test_metrik_peringkat():
    ranked = ["a", "b", "c", "d"]
    assert recall_at_k(ranked, {"c", "z"}, 3) == 0.5
    assert hit_at_k(ranked, {"c"}, 2) == 0.0
    assert reciprocal_rank(ranked, {"b"}) == 0.5
    assert ndcg_at_k(ranked, {"a"}, 10) == 1.0
    assert ndcg_at_k(ranked, {"b"}, 10) == pytest.approx(1 / math.log2(3))
    assert ndcg_at_k(["x"], {"a"}) == 0.0


def test_bootstrap_seed_tetap():
    v = np.array([0.0, 1.0, 1.0, 0.5, 0.25])
    assert bootstrap_ci(v, seed=1) == bootstrap_ci(v, seed=1)
    lo, hi = bootstrap_ci(v)
    assert lo <= v.mean() <= hi
    d, lo, hi = paired_bootstrap_diff(v, v)
    assert d == lo == hi == 0.0
