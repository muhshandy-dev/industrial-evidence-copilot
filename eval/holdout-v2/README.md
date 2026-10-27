# Set holdout v2

Set evaluasi tertutup untuk pencarian dan jawaban atas korpus peraturan K3. Berkas ini menjelaskan cara set disusun. Isi pertanyaan sengaja tidak dicantumkan di sini.

## Penulis dan tanggal

- Penulis: agen AI terpisah (Claude), bekerja tanpa akses ke sistem pencarian, model, atau set evaluasi lain milik proyek.
- Tanggal: 27 Oktober 2026.
- Berkas: `eval/holdout-v2/questions.jsonl` (120 baris, satu objek JSON per baris, UTF-8). Sidik jari ada di `eval/holdout-v2.sha256`.

## Bahan yang dibaca dan tidak dibaca

Dibaca:

- `corpus/korpus.json` (seluruh teks pasal, lewat `Corpus.match_text`) dan `corpus/manifest.json`.
- `docs/penilaian-v2.md` bagian 1 dan 4.
- `src/evidence/evalset.py`, `src/evidence/corpus.py`, `src/evidence/penilaian.py`, hanya untuk validasi (`validate`, `key_hit`, `key_tokens`, `key_hit_v2`).

Tidak dibaca dan tidak dijalankan:

- Isi folder `eval/` selain folder ini, termasuk set dev, test, dan sealed.
- Folder `web/` dan `functions/`, dokumen lain di `docs/`, `README.md`, `ROOT_CAUSE_ANALYSIS.md`, `INDUSTRIAL_EVIDENCE_COPILOT_FINAL_HANDOFF.md`.
- Riwayat git. Tidak ada perintah git yang dijalankan dan tidak ada commit.
- Modul pencarian dan model (bm25, retriever, rerank, dense, generation, evalrag, answer, akar_masalah). Tidak ada sistem pencarian atau model yang dijalankan saat menyusun set.

## Komposisi

Total 120 pertanyaan, id `h001` sampai `h120`, split `holdout-v2`. Urutan baris diacak dengan seed tetap sehingga urutan tidak mengikuti peraturan atau gaya.

### Per gaya

| Gaya | Jumlah |
|---|---|
| parafrase (terjawab, bahasa awam) | 62 |
| leksikal (terjawab, memakai istilah peraturan) | 28 |
| dekat (tak terjawab, topik K3 yang mirip korpus) | 22 |
| luar (tak terjawab, di luar topik K3) | 8 |

### Per jenis

| Jenis | Jumlah |
|---|---|
| angka | 43 |
| kewajiban | 19 |
| prosedur | 13 |
| definisi | 8 |
| sanksi | 7 |
| premis_salah (gaya dekat) | 8 |
| tak_terjawab (14 dekat, 8 luar) | 22 |

### Per peraturan (90 pertanyaan terjawab, menurut dokumen gold pertama)

Jumlah pertanyaan dibuat kira-kira sebanding jumlah pasal di korpus, dengan paling sedikit 3 pertanyaan untuk setiap peraturan.

| Peraturan | Pasal di korpus | Pertanyaan |
|---|---|---|
| permenaker-8-2020 | 188 | 21 |
| permenaker-37-2016 | 89 | 11 |
| permenaker-2-1983 | 87 | 11 |
| permenaker-2-1982 | 36 | 5 |
| permenaker-26-2014 | 34 | 5 |
| permenaker-11-2023 | 31 | 5 |
| kepmenaker-187-1999 | 27 | 5 |
| pp-50-2012 | 22 | 4 |
| permenaker-4-2025 | 21 | 4 |
| uu-1-1970 | 18 | 4 |
| permenaker-13-2025 | 17 | 3 |
| permenaker-3-1998 | 15 | 3 |
| permenaker-15-2008 | 14 | 3 |
| permenaker-3-1982 | 12 | 3 |
| permenaker-8-2010 | 11 | 3 |
| Jumlah | 622 | 90 |

Ciri lain:

- Panjang pertanyaan bervariasi dari 30 sampai 165 karakter.
- 14 pertanyaan terjawab memiliki gold berupa pasal yang lebih panjang dari 1800 karakter; pada sebagian di antaranya jawaban terletak di bagian akhir pasal.
- Satu pertanyaan terjawab memerlukan dua pasal gold sekaligus.
- 8 pertanyaan premis salah masing-masing merujuk satu pasal koreksi dari 8 peraturan yang berbeda.

## Cara label ditetapkan

1. Seluruh teks korpus dibaca per dokumen, lalu setiap pertanyaan terjawab ditulis dari satu ketentuan tertentu. Gold adalah pasal yang memuat jawaban itu.
2. Kunci berisi 1 sampai 3 butir fakta pendek dari pasal gold. Angka ditulis sebagai digit tanpa ejaan dalam kurung. Bila pasal hanya menulis angka dengan huruf, kunci memakai fakta lain dari pasal itu. Tidak ada butir yang seluruh tokennya sudah ada di pertanyaan, dan kata umum tidak pernah menjadi satu-satunya butir.
3. Untuk setiap pertanyaan terjawab, semua pasal lain yang juga memuat seluruh kunci dicari secara otomatis dan ditinjau satu per satu. Pasal yang benar-benar menjawab pertanyaan yang sama dijadikan `gold_alt`. Pasal yang sengaja tidak dijadikan alt (misalnya angka sama untuk benda, lisensi, atau peraturan lain) dicatat beserta alasannya di kolom `catatan`.
4. Pertanyaan tak terjawab bergaya dekat menyentuh topik K3 yang tidak diatur korpus, termasuk topik peraturan yang dikecualikan oleh manifest. Ketiadaan jawaban diperiksa dengan grep kata utuh (huruf kecil) atas `match_text` setiap pasal. Istilah yang dicari dan jumlah pasal yang cocok dicatat di `catatan` setiap baris. Bila istilah ditemukan, catatan menjelaskan mengapa pasal tersebut tetap tidak menjawab.
5. Pertanyaan premis salah memuat premis yang bertentangan dengan satu ketentuan korpus. Baris ini memiliki `pasal_koreksi` (daftar id pasal) dan `kunci_koreksi` (1 sampai 2 butir) yang menyatakan fakta yang benar.
6. Gold, kunci, dan gold_alt untuk semua baris tak terjawab dibiarkan kosong.

## Hasil validasi

- `evidence.evalset.validate(rows, corpus, splits=("holdout-v2",))`: 0 masalah.
- Setiap butir kunci lolos `key_hit` terhadap gabungan `match_text` pasal gold: 90 dari 90 baris.
- Tidak ada butir kunci yang seluruh tokennya ada di pertanyaan, dan tidak ada gold_alt yang tumpang tindih dengan gold.
- Setiap `pasal_koreksi` ada di korpus dan setiap `kunci_koreksi` lolos `key_hit_v2` terhadap `match_text` pasal tersebut: 8 dari 8 baris.
- Tidak ada pertanyaan ganda.
- SHA-256 berkas final: `b8be17a728774d202d85657cb5d6ac2b13d85fa638c12f1649f4a0f2cdf8ed4e`.

## Aturan pakai

- Set ini dijalankan satu kali saja, setelah sistem dibekukan dan pemilik proyek menyetujui proses tersebut.
- Sebelum dijalankan, periksa sidik jari berkas dengan `sha256sum -c holdout-v2.sha256` dari folder `eval/`. Bila tidak cocok, hasil tidak sah.
- Pengembang tidak membuka, membaca, atau memakai isi berkas pertanyaan untuk menyetel sistem, baik sebelum maupun sesudah dijalankan. Setelah dijalankan, set ini dianggap terpakai dan tidak lagi berlaku sebagai holdout untuk versi sistem berikutnya.
