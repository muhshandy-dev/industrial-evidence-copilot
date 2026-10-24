import json
from pathlib import Path

from evidence.answer import coverage, extract_answer, split_units
from evidence.retriever import Retriever

FX = json.loads((Path(__file__).parent / "fixtures" / "mini_corpus.json").read_text())
CHUNKS = FX["chunks"]
R = Retriever(CHUNKS, lsa_dim=5)


def answer(q: str, threshold: float = 5.0):
    ranked = R.search(q, "bm25", 8)
    top = float(R.bm25.scores(R.query_tokens(q))[ranked[0]])
    return extract_answer(q, ranked, CHUNKS, R.bm25.idf, top_score=top, threshold=threshold)


def test_split_units_ayat_dan_butir():
    units = split_units("Pasal 2\n(1) Satu\nlanjutan.\n(2) Dua")
    assert units == ["Pasal 2", "(1) Satu lanjutan.", "(2) Dua"]
    assert split_units("1. A\n2. B") == ["1. A", "2. B"]
    assert split_units("") == []


def test_coverage_oov_menurunkan_nilai():
    idf = {"helm": 2.0, "kerja": 1.0}
    assert coverage(["helm", "kerja"], {"helm", "kerja"}, idf, 2.0) == 1.0
    assert coverage(["helm", "asing"], {"helm"}, idf, 2.0) == 0.5


def test_jawaban_menyalin_kalimat_persis_dari_pasal_teratas():
    ans = answer("berapa kali bejana tekan diperiksa")
    assert not ans.abstain
    assert {e.chunk_idx for e in ans.evidence} == {2}  # sitasi selalu pasal peringkat 1
    for e in ans.evidence:
        assert e.text in " ".join(CHUNKS[e.chunk_idx].split("\n"))  # salinan persis, tanpa karangan
    idx = [e.unit_idx for e in ans.evidence]
    assert idx == sorted(idx)  # tampil menurut urutan di pasal


def test_di_luar_cakupan_menolak():
    ans = answer("resep nasi goreng enak")
    assert ans.abstain and ans.evidence == ()


def test_ambang_tinggi_menolak_pertanyaan_yang_sebenarnya_terjawab():
    assert answer("berapa kali bejana tekan diperiksa", threshold=1e6).abstain


def test_tampilan_memakai_teks_asli_dan_pencocokan_memakai_teks_modern():
    match = ["Pasal 1\n(1) Pengurus wajib melapor."]
    shown = ["Pasal 1\n(1) Pengurus diwadjibkan melapor."]
    ans = extract_answer(
        "pengurus melapor",
        [0],
        match,
        {"pengurus": 1.0, "lapor": 1.0},
        top_score=5.0,
        threshold=1.0,
        display_texts=shown,
    )
    assert not ans.abstain
    assert ans.evidence[0].text == "(1) Pengurus diwadjibkan melapor."
    assert ans.evidence[0].match == "(1) Pengurus wajib melapor."
