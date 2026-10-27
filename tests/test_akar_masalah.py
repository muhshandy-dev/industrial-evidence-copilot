from evidence.akar_masalah import key_hit_setara
from evidence.evalset import key_hit


def test_setara_angka_menerima_angka_tanpa_ejaan():
    assert not key_hit(["3 (tiga) bulan"], "setiap 3 bulan sekali")
    assert key_hit_setara(["3 (tiga) bulan"], "setiap 3 bulan sekali")
    assert key_hit_setara(["80"], "sebesar 80% dari isi tangki")
    assert key_hit_setara(["1 (satu) m"], "ruang bebas 1 meter")
    assert key_hit_setara(["6 (enam) bulan"], "selama enam bulan terus-menerus")


def test_setara_angka_tidak_lebih_ketat_dari_aturan_resmi():
    # Kunci bergaya kata bilangan tetap cocok bila aturan resmi cocok.
    assert key_hit_setara(["tiga", "bulan"], "3 (tiga) bulan")
    assert not key_hit_setara(["5 (lima) tahun"], "berlaku 3 tahun")
