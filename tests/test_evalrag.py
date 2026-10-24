"""Uji unit evaluasi: metrik peringkat, interval, ringkasan jawaban, dan klasifikasi kegagalan."""

from __future__ import annotations

import math

from evidence import evalrag
from evidence import metrics as M


def test_ndcg_salah_satu_cukup():
    gold = {"a", "b", "c", "d"}
    assert M.ndcg_at_k(["a", "x"], gold) == 1.0  # bukti sah tambahan tidak menurunkan nilai
    assert math.isclose(M.ndcg_at_k(["x", "a"], gold), 1 / math.log2(3))
    assert M.ndcg_at_k(["x", "y"], gold) == 0.0


def test_hit_dan_mrr():
    assert M.hit_at_k(["x", "a"], {"a"}, 1) == 0.0
    assert M.hit_at_k(["x", "a"], {"a"}, 2) == 1.0
    assert M.reciprocal_rank(["x", "y", "a"], {"a"}) == 1 / 3


def test_peluang_acak():
    assert evalrag._random_hit(10, 1, 10) == 1.0
    assert math.isclose(evalrag._random_hit(10, 1, 1), 0.1)


def test_bootstrap_deterministik():
    v = [0, 1, 1, 0, 1, 1, 1, 0]
    import numpy as np

    assert M.bootstrap_ci(np.array(v)) == M.bootstrap_ci(np.array(v))


def _rec(**kw) -> dict:
    base = {
        "id": "q1", "split": "test", "gaya": "leksikal", "terjawab": True, "menolak": False,
        "skor": 20.0, "cakupan": 0.9, "sitasi": ["d#pasal-1"], "unit": [0], "verbatim": True,
        "top1": "d#pasal-1", "sitasi_benar": True, "kunci_ada": True, "benar": True,
        "benar_ketat": True, "top1_sah": True,
    }  # fmt: skip
    return {**base, **kw}


def test_ringkasan_jawaban_menghitung_kesalahan_dan_panjang():
    recs = [
        _rec(id="q1"),
        _rec(id="q2", sitasi_benar=False, benar=False, benar_ketat=False, unit=[0, 1]),
        _rec(id="q3", menolak=True, sitasi=[], unit=[], benar=False, benar_ketat=False,
             sitasi_benar=False, kunci_ada=False),
        _rec(id="q4", terjawab=False, gaya="dekat", menolak=True, sitasi=[], unit=[]),
        _rec(id="q5", terjawab=False, gaya="dekat", menolak=False),
    ]  # fmt: skip
    s = evalrag.summarize_answers(recs)
    assert (s["jawaban_benar"]["k"], s["jawaban_benar"]["n"]) == (1, 3)
    assert (s["sitasi_benar_dari_yang_dijawab"]["k"], s["sitasi_benar_dari_yang_dijawab"]["n"]) == (
        1,
        2,
    )
    assert (s["menolak_padahal_terjawab"]["k"], s["menolak_padahal_terjawab"]["n"]) == (1, 3)
    assert (s["dijawab_padahal_tak_terjawab"]["k"], s["dijawab_padahal_tak_terjawab"]["n"]) == (
        1,
        2,
    )
    assert s["unit_per_jawaban"] == 1.5


def test_klasifikasi_kegagalan():
    rows = [{"id": f"q{i}", "tanya": f"t{i}", "gold": ["d#pasal-1"]} for i in range(1, 6)]
    recs = [
        _rec(id="q1"),  # benar: tidak dicatat
        _rec(id="q2", sitasi_benar=False, benar=False),
        _rec(id="q3", menolak=True, benar=False, sitasi=[]),
        _rec(id="q4", kunci_ada=False, benar=False),
        _rec(id="q5", terjawab=False),
    ]
    rows[4]["gold"] = []
    kinds = {f["id"]: f["jenis"] for f in evalrag.failures(rows, recs, None)}
    assert kinds == {
        "q2": "sitasi_pasal_salah",
        "q3": "menolak_padahal_terjawab",
        "q4": "pasal_benar_kunci_tidak_ada",
        "q5": "dijawab_padahal_tak_terjawab",
    }
