"""Uji konsistensi data di repositori: korpus, pertanyaan beku, hasil evaluasi, data situs."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import pytest

from evidence import evalrag, evalset
from evidence.corpus import Corpus

ROOT = Path(__file__).resolve().parent.parent
KORPUS = ROOT / "corpus" / "korpus.json"
PERTANYAAN = ROOT / "eval" / "questions.jsonl"
HASIL = ROOT / "eval" / "results.json"
SITUS = ROOT / "web" / "public" / "data"


@pytest.fixture(scope="module")
def corpus() -> Corpus:
    return Corpus.read(KORPUS)


def test_korpus_nyata(corpus):
    assert corpus.asal == "nyata"
    assert len(corpus.docs) == 15
    for d in corpus.docs:
        assert len(d.sha256) == 64
        assert d.url.startswith("https://jdih.kemnaker.go.id/")


def test_pertanyaan_valid_terhadap_korpus(corpus):
    rows = evalset.read_questions(PERTANYAAN)
    assert evalset.validate(rows, corpus) == []


def test_hasil_cocok_dengan_korpus_dan_pertanyaan():
    hasil = json.loads(HASIL.read_text(encoding="utf-8"))
    assert hasil["korpus"]["sha256"] == hashlib.sha256(KORPUS.read_bytes()).hexdigest()
    assert hasil["pertanyaan"]["sha256"] == hashlib.sha256(PERTANYAAN.read_bytes()).hexdigest()


def test_data_situs_sinkron_dengan_repo():
    hasil = json.loads(HASIL.read_text(encoding="utf-8"))
    assert (SITUS / "korpus.json").read_bytes() == KORPUS.read_bytes()
    situs = json.loads((SITUS / "evaluasi.json").read_text(encoding="utf-8"))
    assert situs["jawaban"] == hasil["jawaban"]
    assert situs["ambang_jawab"] == hasil["ambang"]["terpilih"]


def _sama(a, b, path=""):
    """Bandingkan dua struktur JSON; angka pecahan boleh beda sangat kecil antar platform."""
    if isinstance(a, dict):
        assert a.keys() == b.keys(), path
        for k in a:
            _sama(a[k], b[k], f"{path}/{k}")
    elif isinstance(a, list):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b, strict=True)):
            _sama(x, y, f"{path}[{i}]")
    elif isinstance(a, float):
        assert math.isclose(a, b, rel_tol=1e-6, abs_tol=1e-6), f"{path}: {a} vs {b}"
    else:
        assert a == b, f"{path}: {a} vs {b}"


def test_evaluasi_dapat_direproduksi():
    """Menghitung ulang dari korpus dan pertanyaan beku harus menghasilkan angka yang sama."""
    baru = evalrag.run(KORPUS, PERTANYAAN)
    lama = json.loads(HASIL.read_text(encoding="utf-8"))
    for hasil in (baru, lama):
        hasil.pop("lingkungan", None)
    _sama(json.loads(json.dumps(baru)), lama)
