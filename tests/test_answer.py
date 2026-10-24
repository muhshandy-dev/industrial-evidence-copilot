import json
from pathlib import Path

from evidence.answer import coverage, extract_answer, split_units
from evidence.retriever import Retriever

FX = json.loads((Path(__file__).parent / "fixtures" / "mini_corpus.json").read_text())
CHUNKS = FX["chunks"]


def test_split_units_ayat_dan_butir():
    units = split_units("Pasal 2\n(1) Satu\nlanjutan.\n(2) Dua")
    assert units == ["Pasal 2", "(1) Satu lanjutan.", "(2) Dua"]
    assert split_units("1. A\n2. B") == ["1. A", "2. B"]
    assert split_units("") == []


def test_coverage_oov_menurunkan_nilai():
    idf = {"helm": 2.0, "kerja": 1.0}
    assert coverage(["helm", "kerja"], {"helm", "kerja"}, idf, 2.0) == 1.0
    assert coverage(["helm", "asing"], {"helm"}, idf, 2.0) == 0.5


def test_jawaban_menyalin_kalimat_persis():
    r = Retriever(CHUNKS, lsa_dim=5)
    q = "berapa kali bejana tekan diperiksa"
    ans = extract_answer(q, r.search(q, "hybrid", 8), CHUNKS, r.bm25.idf)
    assert not ans.abstain
    for e in ans.evidence:
        assert e.text in " ".join(CHUNKS[e.chunk_idx].split("\n"))  # salinan persis, tanpa karangan
    assert ans.evidence[0].chunk_idx == 2


def test_di_luar_cakupan_menolak():
    r = Retriever(CHUNKS, lsa_dim=5)
    q = "resep nasi goreng enak"
    ans = extract_answer(q, r.search(q, "hybrid", 8), CHUNKS, r.bm25.idf)
    assert ans.abstain and ans.evidence == ()
