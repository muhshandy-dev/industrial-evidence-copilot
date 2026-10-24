"""Uji set pertanyaan: pembekuan split dan label test, validasi, dan pemeriksaan kunci fakta."""

from __future__ import annotations

from pathlib import Path

import pytest

from evidence import evalset
from evidence.corpus import Chunk, Corpus, Doc

ROOT = Path(__file__).resolve().parent.parent


def _draft(tanya: str, gaya: str = "leksikal", gold=("d#pasal-1",), kunci=("lima",), **kw) -> dict:
    return {"tanya": tanya, "gaya": gaya, "gold": list(gold), "kunci": list(kunci), **kw}


def test_penanda_ayat_tidak_menjadi_kunci():
    assert "1" not in evalset.key_tokens("(1) Lisensi berlaku\n2. kedua (3a)")
    assert "5" in evalset.key_tokens("berlaku paling lama 5 tahun")
    assert "5" in evalset.key_tokens("paling lama 5. Lalu")  # angka di akhir kalimat tetap isi


def test_key_hit_tas_kata_tanpa_urutan():
    assert evalset.key_hit(["tahun", "5"], "(1) berlaku 5 tahun")
    assert not evalset.key_hit(["5 tahun"], "(5) berlaku selama tiga tahun")


def test_relevant_menyertakan_alternatif():
    r = {"gold": ["a"], "gold_alt": ["b"]}
    assert evalset.relevant(r) == {"a", "b"}
    assert evalset.relevant({"gold": ["a"]}) == {"a"}


def test_split_deterministik_dan_berstrata():
    rows = [_draft(f"pertanyaan nomor {i}", gold=(f"d{i % 3}#pasal-1",)) for i in range(30)]
    a = evalset.assign_split([dict(r) for r in rows])
    b = evalset.assign_split([dict(r) for r in reversed(rows)])
    assert {r["tanya"]: r["split"] for r in a} == {r["tanya"]: r["split"] for r in b}
    assert {r["split"] for r in a} == {"dev", "test"}
    assert sorted(r["id"] for r in a) == [f"q{i:03d}" for i in range(1, 31)]


def _frozen() -> list[dict]:
    rows = [_draft(f"soal {i}", gold=(f"d{i % 2}#pasal-1",)) for i in range(10)]
    return evalset.assign_split(rows)


def test_merge_frozen_menahan_id_dan_split():
    frozen = _frozen()
    merged = evalset.merge_frozen([dict(r) for r in frozen], frozen)
    assert [(r["id"], r["split"]) for r in merged] == [(r["id"], r["split"]) for r in frozen]


def test_merge_frozen_menolak_perubahan_label_test():
    frozen = _frozen()
    drafts = [dict(r) for r in frozen]
    t = next(r for r in drafts if r["split"] == "test")
    t["kunci"] = ["berubah"]
    with pytest.raises(SystemExit, match="dibekukan"):
        evalset.merge_frozen(drafts, frozen)


def test_merge_frozen_mengizinkan_label_dev_berubah_tetapi_pertanyaan_baru_harus_dev():
    frozen = _frozen()
    drafts = [dict(r) for r in frozen]
    next(r for r in drafts if r["split"] == "dev")["kunci"] = ["baru"]
    evalset.merge_frozen(drafts, frozen)
    with pytest.raises(SystemExit, match="split dev"):
        evalset.merge_frozen([*drafts, _draft("soal baru", split="test")], frozen)
    out = evalset.merge_frozen([*drafts, _draft("soal baru", split="dev")], frozen)
    assert out[-1]["id"] == f"q{len(frozen) + 1:03d}"


def test_merge_frozen_menolak_pertanyaan_beku_hilang():
    frozen = _frozen()
    with pytest.raises(SystemExit, match="hilang"):
        evalset.merge_frozen([dict(r) for r in frozen[1:]], frozen)


def test_digest_test_berubah_hanya_bila_label_test_berubah():
    rows = _frozen()
    base = evalset.test_digest(rows)
    dev = [dict(r) for r in rows]
    next(r for r in dev if r["split"] == "dev")["kunci"] = ["x"]
    assert evalset.test_digest(dev) == base
    tst = [dict(r) for r in rows]
    next(r for r in tst if r["split"] == "test")["gold_alt"] = ["d1#pasal-9"]
    assert evalset.test_digest(tst) != base


def _korpus() -> Corpus:
    doc = Doc(
        id="d", jenis="PP", nomor="1", tahun=2000, tentang="x", judul_resmi="x", url="u",
        url_pdf="u", sha256="0" * 64, status_jdih="Berlaku", tanggal_akses="2026-10-24",
        ocr=False, ejaan_lama=False,
    )  # fmt: skip
    ch = Chunk(
        id="d#pasal-1", dok=0, label="Pasal 1", bab="I", judul_bab="Umum",
        teks="(1) Lisensi berlaku lima tahun.", teks_cari="", catatan="",
    )  # fmt: skip
    return Corpus("nyata", [doc], [ch], {})


def test_validate_menangkap_kesalahan_umum():
    c = _korpus()
    ok = {"id": "q1", "split": "dev", **_draft("apa masa lisensi")}
    assert evalset.validate([ok], c) == []
    salah_kunci = {**ok, "id": "q2", "tanya": "lain", "kunci": ["sepuluh"]}
    assert any("kunci" in p for p in evalset.validate([salah_kunci], c))
    tak_ada = {**ok, "id": "q3", "tanya": "tiga", "gold": ["d#pasal-99"]}
    assert any("tidak ada di korpus" in p for p in evalset.validate([tak_ada], c))
    ganda = {**ok, "id": "q4"}
    assert any("ganda" in p for p in evalset.validate([ok, ganda], c))
    tak_terjawab_salah = {**ok, "id": "q5", "tanya": "lima", "gold": [], "gaya": "leksikal"}
    assert any("tak terjawab" in p for p in evalset.validate([tak_terjawab_salah], c))


def test_label_test_di_repo_sama_dengan_yang_dibekukan():
    rows = evalset.read_questions(ROOT / "eval" / "questions.jsonl")
    beku = (ROOT / "eval" / "test-beku.sha256").read_text().strip()
    assert evalset.test_digest(rows) == beku
