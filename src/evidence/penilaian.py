"""Aturan penilaian v2, dibekukan 27 Oktober 2026 sebelum ada keluaran baru (docs/penilaian-v2.md).

Penilaian v1 (evalset.key_hit dan generation.judge) tetap dihitung dan dilaporkan berdampingan.
Perbedaan v2:

1. Kunci fakta "setara angka": jawaban memuat kunci bila cocok menurut aturan v1 ATAU setelah
   normalisasi angka (ejaan dalam kurung sesudah angka dibuang, kata bilangan sebelum satuan
   menjadi angka, "%" menjadi "persen", "meter" menjadi "m"). Tidak pernah lebih ketat dari v1.
   Aturan ini berlaku sama untuk mode generatif dan kutipan.
2. Koreksi premis: pertanyaan tak terjawab berjenis "premis_salah" boleh dijawab bila jawaban
   mengoreksi premisnya dengan sitasi sah. Syaratnya ditetapkan penulis set sebelum keluaran ada:
   semua pasal yang dikutip termasuk `pasal_koreksi`, dan semua `kunci_koreksi` ada di jawaban
   (aturan kunci v2). Tanpa label itu, jawaban apa pun tetap dihitung keliru.

Aturan ini pertama kali dirumuskan setelah kegagalan set tersegel lama terlihat
(ROOT_CAUSE_ANALYSIS.md), jadi angka v2 pada set lama hanya diagnosis. Generalisasinya diukur pada
holdout v2 yang ditulis setelah aturan ini dibekukan.
"""

from __future__ import annotations

import re

from .evalset import key_hit, key_tokens

VERSI = "v2"

_ANGKA = {
    "dua belas": "12", "sebelas": "11", "sepuluh": "10", "sembilan": "9", "delapan": "8",
    "tujuh": "7", "enam": "6", "lima": "5", "empat": "4", "tiga": "3", "dua": "2", "satu": "1",
}  # fmt: skip
_SATUAN = r"(?=\s+(?:bulan|tahun|hari|jam|minggu|kali|orang|m|meter)\b)"


def _norm(t: str) -> str:
    t = t.lower()
    t = re.sub(r"(\d[\d.,]*)\s*\(\s*[a-z ]+\s*\)", r"\1", t)
    for w, d in _ANGKA.items():
        t = re.sub(rf"\b{w}\b{_SATUAN}", d, t)
    t = re.sub(r"(\d)\s*%", r"\1 persen", t)
    return re.sub(r"\bmeter\b", "m", t)


def key_hit_v2(kunci: list[str], text: str) -> bool:
    """Semua butir kunci ada di teks menurut aturan v1 atau aturan setara angka."""
    if key_hit(kunci, text):
        return True
    toks = key_tokens(_norm(text))
    return all(key_tokens(_norm(k)) <= toks for k in kunci)


def koreksi_premis_sah(row: dict, sitasi: list[str], teks: str) -> bool:
    """Jawaban atas pertanyaan premis salah dihitung aman bila mengoreksi premis dengan sitasi sah.
    sitasi: id pasal yang dikutip kalimat yang ditampilkan. teks: kalimat yang ditampilkan."""
    pasal = set(row.get("pasal_koreksi") or [])
    kunci = row.get("kunci_koreksi") or []
    if row.get("jenis") != "premis_salah" or not pasal or not kunci or not sitasi:
        return False
    return set(sitasi) <= pasal and key_hit_v2(kunci, teks)


def nilai_tak_terjawab(row: dict, menolak: bool, mode: str, sitasi: list[str], teks: str) -> str:
    """Hasil v2 untuk pertanyaan tak terjawab: "menolak", "koreksi_premis", atau "keliru"."""
    if menolak:
        return "menolak"
    if mode == "generatif" and koreksi_premis_sah(row, sitasi, teks):
        return "koreksi_premis"
    return "keliru"


# Kriteria lolos holdout v2 (docs/penilaian-v2.md), ditetapkan sebelum holdout v2 dijalankan.
KRITERIA = {
    "generatif_benar_min": 0.70,  # dan harus lebih tinggi dari kutipan langsung pada set yang sama
    "tak_terjawab_keliru_maks": 0.10,
    "sitasi_semua_sah_min": 0.90,
    "kalimat_tanpa_sitasi_tampil_maks": 0,
}


def periksa_kriteria(r: dict) -> dict:
    """r: ringkasan holdout dengan kunci generatif_benar, kutipan_benar, tak_terjawab_keliru,
    sitasi_semua_sah (proporsi) dan kalimat_tanpa_sitasi_tampil (jumlah)."""
    k = KRITERIA
    hasil = {
        "generatif_benar": r["generatif_benar"] >= k["generatif_benar_min"],
        "lebih_baik_dari_kutipan": r["generatif_benar"] > r["kutipan_benar"],
        "tak_terjawab_keliru": r["tak_terjawab_keliru"] <= k["tak_terjawab_keliru_maks"],
        "sitasi_semua_sah": r["sitasi_semua_sah"] >= k["sitasi_semua_sah_min"],
        "kalimat_tanpa_sitasi": r["kalimat_tanpa_sitasi_tampil"]
        <= k["kalimat_tanpa_sitasi_tampil_maks"],
    }
    hasil["lolos"] = all(hasil.values())
    return hasil
