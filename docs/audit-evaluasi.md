# Audit evaluasi dan tindak lanjutnya

Desain evaluasi diaudit secara independen pada 2026-10-24 (laporan lengkap: `docs/audit/laporan-audit-2026-10-24.md`). Auditor mereproduksi `eval/results.json` dan hasilnya identik. Tabel ini mencatat apa yang dilakukan untuk tiap temuan.

Status: **Diperbaiki** (kode atau data berubah), **Diungkap** (tidak dapat diperbaiki tanpa data baru, jadi dinyatakan terbuka di dokumen dan situs), **Terbuka** (pekerjaan lanjutan).

| ID | Temuan | Status | Tindakan |
| --- | --- | --- | --- |
| A1 | Test bukan holdout bersih | Diungkap | Disebut "semi-holdout" di situs, `results.json` (`protokol`), dan `docs/evaluasi.md`. Data situs tidak lagi memuat hasil per pertanyaan. Set tersegel baru: dijalankan sekali pada 26 Oktober 2026 (`eval/sealed/hasil.json`). |
| A2 | Penyetelan tidak diungkap (jumlah kalimat, syarat kalimat kedua) | Diperbaiki | Semua keputusan setelah run pertama didaftar di `protokol` dan ditampilkan. Klaim "hanya ambang yang disetel" dihapus dari kode, data, dan situs. |
| A3 | Label test tidak dibekukan | Diperbaiki | `merge_frozen` menolak perubahan label test; digest label test di `eval/test-beku.sha256` diperiksa oleh `eval-set check` dan pytest. |
| A4 | Ajudikasi jawaban alternatif tidak konsisten | Diungkap | Dampak angka kecil (satu pertanyaan pada peringkat 1). Label test sengaja tidak diubah lagi agar tidak menambah penyetelan pada test. Pedoman ajudikasi buta: Terbuka. |
| A5 | 25 pertanyaan tak terjawab tambahan hanya di dev | Diungkap | Dicatat beserta efeknya pada ambang (15 → 14). |
| B1 | "Jawaban benar" hampir sama dengan pasal peringkat 1 benar | Diungkap | Definisi dan keterbatasannya dijelaskan di kartu angka situs dan laporan; rata-rata kalimat per jawaban kini dilaporkan. Emas tingkat ayat: Terbuka. |
| B2 | Kualitas kunci | Diperbaiki sebagian | Penanda ayat "(1)" dan butir "1." tidak lagi menjadi token kunci (tidak mengubah angka). Kunci frasa dan normalisasi angka: Terbuka. |
| B3 | Uji verbatim tautologis; teks OCR | Diungkap | Situs dan dokumen menyebut "sama dengan teks korpus (hasil ekstraksi PDF/OCR)" dan bahwa nol itu sifat konstruksi. Bendera OCR Permenaker 2/1982 diperbaiki. Pembersihan OCR: Terbuka. |
| B4 | Gerbang BM25 bias panjang pertanyaan | Diungkap | Uji tekanan 12 pertanyaan (`eval/stress.jsonl`, 7 tetap dijawab) kini bagian evaluasi dan tampil di situs. Gerbang baru tidak dibuat karena hanya dapat dikalibrasi pada data yang sudah terlihat. |
| B5 | nDCG dengan alternatif, catatan basi | Diperbaiki | nDCG memakai IDCG = 1 (relevansi "salah satu cukup"); docstring dan rujukan dokumen diperbarui. |
| B6 | Penjelasan penyebab kegagalan keliru | Diperbaiki | Situs kini menghitung dari data: 19 dari 23 salah sitasi berada di peraturan yang sama. Klaim sebab dihapus. |
| C1–C6 | Statistik: sampel kecil, winner's curse, ambang rapuh | Diungkap | Angka dev tidak lagi ditampilkan sebagai kinerja; kolom MRR dev diberi label "dasar pemilihan". Pertukaran gerbang dibanding selalu menjawab ditampilkan. Penjelasan interval yang keliru dihapus. |
| D1–D4 | Pertanyaan tak terjawab terlalu mudah, sebagian separuh terjawab | Diungkap | Dicatat di situs dan laporan; label test tidak diubah. Set tak terjawab baru: Terbuka. |
| F1 | Hasil per pertanyaan test diekspor ke web | Diperbaiki | `evidence export` tidak lagi menyalin `per_pertanyaan`. |
| F2 | Tidak ada tes untuk evalset dan evalrag | Diperbaiki | `tests/test_evalset.py`, `tests/test_evalrag.py`, `tests/test_repo_data.py` (termasuk hitung ulang evaluasi lengkap). |
| F3 | Bendera OCR manifest tidak andal | Diperbaiki | Permenaker 2/1982 ditandai OCR. |
| F4 | Komposisi pertanyaan tidak proporsional terhadap korpus | Diungkap | Dicatat di sini. |
| F5 | `evidence eval` menimpa hasil di repo | Diperbaiki | Opsi `--out`. |
| F6 | Angka test tercetak di tiap run | Diperbaiki | `evidence eval` hanya mencetak metode dan ambang. |

## Klaim yang dilarang (dipatuhi di situs dan dokumen)

"Bebas halusinasi", "terverifikasi", "kutipan identik dengan dokumen resmi", "selalu menolak pertanyaan di luar cakupan", angka dev sebagai kinerja, "test tak tersentuh", "hanya ambang yang disetel", "dikunci sebelum evaluasi", "ditulis tangan" atau "pertanyaan nyata pengguna", "gerbang meningkatkan akurasi", klaim sebab tentang jenis pertanyaan atau penyebab kegagalan, dan generalisasi di luar 15 peraturan.
