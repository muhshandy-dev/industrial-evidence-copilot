import json
from pathlib import Path

from evidence.text import stem, tokenize

CASES = json.loads((Path(__file__).parent / "fixtures" / "tokenizer_cases.json").read_text())


def test_kasus_bersama():
    for case in CASES:
        assert tokenize(case["text"]) == case["tokens"], case["text"]


def test_tanpa_stemming_dan_stopword():
    assert tokenize("Pengusaha dan pekerja", use_stem=False) == ["pengusaha", "pekerja"]
    assert tokenize("dan pekerja", drop_stopwords=False, use_stem=False) == ["dan", "pekerja"]


def test_angka_dan_kata_pendek_tidak_berubah():
    assert stem("2012") == "2012"
    assert stem("kerja") == "kerja"
    assert tokenize("a b 3") == []


def test_stem_idempoten_pada_kasus_umum():
    for w in ["usaha", "wajib", "alat", "lindung", "kerja"]:
        assert stem(w) == w
