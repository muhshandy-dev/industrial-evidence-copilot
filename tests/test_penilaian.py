from evidence.penilaian import KRITERIA, key_hit_v2, nilai_tak_terjawab, periksa_kriteria

PREMIS = {
    "jenis": "premis_salah",
    "pasal_koreksi": ["permenaker-3-1998#pasal-4"],
    "kunci_koreksi": ["2 x 24 jam"],
}


def test_kunci_v2_menerima_angka_tanpa_ejaan():
    assert key_hit_v2(["3 (tiga) bulan"], "setiap 3 bulan sekali")
    assert key_hit_v2(["1 (satu) m"], "jarak 1 meter")
    assert not key_hit_v2(["5 (lima) tahun"], "berlaku 3 tahun")


def test_koreksi_premis_butuh_sitasi_dan_kunci():
    ok = nilai_tak_terjawab(
        PREMIS, False, "generatif", ["permenaker-3-1998#pasal-4"], "Batasnya 2 x 24 jam."
    )
    assert ok == "koreksi_premis"
    lain = nilai_tak_terjawab(
        PREMIS, False, "generatif", ["uu-1-1970#pasal-1"], "Batasnya 2 x 24 jam."
    )
    assert lain == "keliru"
    salah = nilai_tak_terjawab(
        PREMIS, False, "generatif", ["permenaker-3-1998#pasal-4"], "Batasnya 7 x 24 jam."
    )
    assert salah == "keliru"
    assert nilai_tak_terjawab(PREMIS, True, "tolak_gerbang", [], "") == "menolak"
    # Tanpa label koreksi, jawaban apa pun keliru; kutipan cadangan tidak pernah dihitung koreksi.
    assert nilai_tak_terjawab({"jenis": "premis_salah"}, False, "generatif", ["x"], "y") == "keliru"
    assert (
        nilai_tak_terjawab(
            PREMIS, False, "cadangan_ekstraktif", ["permenaker-3-1998#pasal-4"], "2 x 24 jam"
        )
        == "keliru"
    )


def test_kriteria_lolos_hanya_bila_semua_syarat():
    dasar = {
        "generatif_benar": 0.72,
        "kutipan_benar": 0.6,
        "tak_terjawab_keliru": 0.1,
        "sitasi_semua_sah": 0.9,
        "kalimat_tanpa_sitasi_tampil": 0,
    }
    assert periksa_kriteria(dasar)["lolos"]
    assert not periksa_kriteria({**dasar, "kutipan_benar": 0.72})["lolos"]
    assert not periksa_kriteria({**dasar, "generatif_benar": 0.69})["lolos"]
    assert KRITERIA["generatif_benar_min"] == 0.70


def test_holdout_v2_tidak_berubah_dari_hash_yang_di_commit():
    import hashlib
    from pathlib import Path

    ev = Path(__file__).resolve().parents[1] / "eval"
    want, name = (ev / "holdout-v2.sha256").read_text(encoding="utf-8").split()
    assert hashlib.sha256((ev / name).read_bytes()).hexdigest() == want
