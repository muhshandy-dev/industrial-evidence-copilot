# Kartu data

Korpus yang dipakai Industrial Evidence Copilot, dan apa yang boleh dan tidak boleh disimpulkan darinya.

## Isi

- 15 peraturan keselamatan dan kesehatan kerja (K3) Indonesia, dipecah menjadi 622 pasal.
- Daftar lengkap (judul, status, tanggal akses, SHA-256, tautan) ada di `corpus/manifest.json` dan di halaman "Cara kerja dan batas" situs.
- Satuan pencarian dan kutipan adalah satu pasal. Kutipan jawaban adalah satu ayat atau butir di dalam pasal itu.

## Sumber dan lisensi

- Sumber: unduhan PDF resmi tiap peraturan dari JDIH Kementerian Ketenagakerjaan (`jdih.kemnaker.go.id`). Status "Berlaku" adalah status yang tertera di JDIH pada 2026-10-24, tanggal akses. Itu bukan jaminan peraturannya belum diubah atau dicabut.
- Dasar penggunaan: Pasal 42 huruf b Undang-Undang Nomor 28 Tahun 2014 tentang Hak Cipta, yang mengecualikan peraturan perundang-undangan dari objek hak cipta.
- **Catatan jujur tentang dasar lisensi.** Rujukan pasal itu baru terverifikasi dari sumber sekunder. Teks resmi di `peraturan.bpk.go.id` tidak dapat dibuka dari lingkungan pengembangan (ditahan tantangan Cloudflare). Nomor pasalnya perlu dicek manual oleh pemilik proyek. Dokumen ini bukan nasihat hukum.
- Kode berlisensi MIT. Kutipan peraturan tetap harus dirujuk ke sumber resminya.

## Cara memperoleh dan memeriksa

```
evidence data fetch    # unduh PDF, tolak bila SHA-256 tidak cocok dengan manifest
evidence build         # ekstraksi teks per pasal -> corpus/korpus.json
```

PDF mentah tidak ikut di repositori (`data/raw/`, diabaikan git). Yang ikut adalah `corpus/korpus.json` (teks per pasal) dan SHA-256 tiap PDF, sehingga siapa pun dapat mengunduh sendiri dan memastikan hasilnya sama.

## Kualitas teks

| Hal | Kondisi |
| --- | --- |
| Ejaan lama | UU 1/1970 memakai ejaan lama. Teks asli ditampilkan apa adanya; ejaan modern dipakai hanya untuk pencocokan (kolom `teks_cari`). |
| OCR | Tiga dokumen berasal dari lapisan teks OCR (Permenaker 37/2016, 8/2020, dan 2/1982). Tiga nomor pasal yang terbaca keliru diperbaiki mengikuti urutan dan dicatat di `peringatan_ekstraksi`. Isi teksnya **belum** dibersihkan: audit menemukan sedikitnya 43 pasal dengan salah baca seperti "keija" untuk "kerja", yang juga mengganggu pencarian. |
| Pemisahan ayat | Berdasarkan penomoran `(1)`, `1.`, di awal baris. Pasal tanpa penomoran menjadi satu unit. |
| Tabel, gambar, lampiran | Tidak diekstraksi. Pertanyaan yang jawabannya ada di lampiran tidak akan terjawab. |

## Dokumen yang sengaja dikeluarkan

Enam peraturan K3 lain dicoba diambil lalu dikeluarkan karena teksnya tidak layak dikutip: lima berupa PDF pindaian tanpa lapisan teks atau dengan OCR rusak parah, satu berkas JDIH hanya berisi satu halaman abstrak. Alasan per dokumen ada di `corpus/manifest.json` (kunci `dikecualikan`). OCR belum dipakai karena kutipan yang salah baca lebih berbahaya daripada dokumen yang tidak ada.

## Batas

- 15 peraturan bukan seluruh hukum K3 Indonesia. Pertanyaan di luar korpus harus ditolak, dan itulah yang diukur.
- Peraturan berubah. Tanggal akses tertera; tidak ada pembaruan otomatis.
- Pertanyaan evaluasi ditulis pengembang, bukan diambil dari pengguna nyata (lihat `docs/evaluasi.md`).
