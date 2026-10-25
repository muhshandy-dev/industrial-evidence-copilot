# Eksperimen prompt (data dev)

## Mengapa

Run generasi penuh pertama dengan prompt situs ("bertahan") memberi hasil buruk. Model 1,5B
hampir tidak pernah menjawab sendiri, dan model CPU 0,5B jarang menulis sitasi.

Keluaran mentah per model dan set (semua pertanyaan, termasuk yang ditolak gerbang):

| Konfigurasi | Set | Menolak ("TIDAK DITEMUKAN") | Hanya nomor sitasi | Kalimat tanpa sitasi | Kalimat bersitasi |
| --- | --- | --- | --- | --- | --- |
| 1,5B bertahan | dev | 83 | 12 | 6 | 3 |
| 1,5B bertahan | test | 79 | 21 | 9 | 8 |
| 0,5B bertahan | dev | 14 | 4 | 56 | 30 |
| 0,5B bertahan | test | 8 | 7 | 86 | 16 |

Pada data uji hanya 4 dari 117 pertanyaan berakhir sebagai jawaban generatif. Pada dev, di antara
53 pertanyaan yang lolos gerbang, model 1,5B menolak 26 dan sisanya jatuh ke kutipan cadangan.
Model 0,5B menghasilkan 13 jawaban generatif di dev, tetapi tidak satu pun benar, dan hanya 3 dari
24 kalimatnya didukung NLI.

## Kandidat

Semua kandidat ada di `web/public/js/gen/prompt.js` (`susunPesan`). Aturan data-bukan-perintah
tetap ada di semua kandidat.

- **k1**: susunan "bertahan" (pembatas XML), aturan baru, satu contoh fiktif di prompt sistem.
- **k2**: kutipan bernomor tanpa XML, pertanyaan sebelum dan sesudah kutipan, aturan baru, contoh.
- **k3**: contoh sebagai giliran percakapan (user lalu assistant), pembatas XML, aturan baru.
- **k4**: seperti k1 tetapi tanpa aturan tolak (penolakan diserahkan ke gerbang dan pemeriksaan).

Aturan baru: jawab dengan 1 sampai 3 kalimat lengkap; setiap kalimat diakhiri nomor kutipan;
jangan menulis nomor kutipan saja; kutipan [1] biasanya paling relevan dan jawablah walau kata-
katanya berbeda; tulis "TIDAK DITEMUKAN" hanya bila tidak ada satu pun kutipan yang memuat jawaban.
Contohnya fiktif ("Peraturan Contoh (fiktif) tentang Tangga Kerja"), bukan dari korpus.

## Aturan pilih (ditulis sebelum hasil kandidat terlihat)

Kode: `choose_prompt` di `src/evidence/generation.py`, diuji di `tests/test_generation.py`.

1. Hanya data dev, hanya pertanyaan yang lolos gerbang (yang lain tidak pernah sampai ke model).
2. Ukuran utama: jumlah pertanyaan terjawab yang dijawab generatif dan benar (sitasi pasal emas dan
   fakta kunci ada), dengan model utama 1,5B.
3. Syarat: pertanyaan tak terjawab yang dijawab tidak lebih banyak dari prompt "bertahan", dan
   kalimat generatif yang didukung NLI paling sedikit 80% (bila ada 10 kalimat atau lebih).
4. Seri (selisih 1 pertanyaan atau kurang): pilih yang lebih baik di model CPU 0,5B, lalu yang
   paling sederhana (bertahan, k1, k4, k2, k3).

Data test, set injeksi, dan set tersegel tidak dipakai untuk memilih. Setelah prompt dipilih,
semua set dibangkitkan ulang dan dilaporkan apa adanya. Catatan jujur: angka test dan injeksi
prompt lama sudah terlihat sebelum eksperimen ini, jadi set tersegel tetap menjadi pemeriksaan
akhir yang bersih.

## Menjalankan

Workflow `Eksperimen prompt` (dispatch). Hasilnya di `eval/eksperimen-prompt.json`:

```
evidence gen-eksperimen --varian bertahan,k1,k2,k3,k4
```

## Hasil putaran 1

Dev, 53 pertanyaan yang lolos gerbang (50 terjawab, 3 tak terjawab). "Generatif benar" = jawaban
generatif yang mengutip pasal emas dan memuat fakta kunci. "Didukung" = kalimat generatif yang
didukung NLI (peluang entailment paling sedikit 0,5).

| Konfigurasi | Generatif benar | Mode generatif | Tak terjawab yang dijawab | Didukung NLI |
| --- | --- | --- | --- | --- |
| bertahan, 1,5B | 0 | 0 | 0 | 0 dari 0 |
| k1, 1,5B | 10 | 24 | 1 | 20 dari 37 (54%) |
| k2, 1,5B | 15 | 30 | 2 | 24 dari 42 (57%) |
| k3, 1,5B | 20 | 40 | 2 | 27 dari 41 (66%) |
| k4, 1,5B | 10 | 24 | 3 | 21 dari 38 (55%) |
| bertahan, 0,5B | 0 | 13 | 2 | 3 dari 24 (13%) |
| k1, 0,5B | 5 | 31 | 3 | 22 dari 50 (44%) |
| k2, 0,5B | 21 | 53 | 3 | 11 dari 71 (15%) |
| k3, 0,5B | 9 | 41 | 2 | 29 dari 69 (42%) |
| k4, 0,5B | 7 | 33 | 2 | 29 dari 62 (47%) |

Sumber: `eval/eksperimen-prompt.json`.

**Menurut aturan pilih, tidak ada kandidat yang lolos.** Semua kandidat menjawab paling sedikit
satu pertanyaan tak terjawab (bertahan: 0), dan tidak ada yang mencapai 80% kalimat didukung NLI.
Aturan lalu mempertahankan "bertahan", yang praktis tidak generatif. Aturan tidak diubah setelah
hasil terlihat.

Kandidat memang membuat model mau menjawab (k3 dengan 1,5B: 40 jawaban generatif, 20 benar),
tetapi sekitar sepertiga kalimatnya tidak didukung pasal yang dikutipnya. Pemeriksaan manual
saya atas 14 kalimat k3 (1,5B) yang dinilai tidak didukung: sekitar 9 memang keliru (angka yang
salah atau dikarang, misalnya umur minimal 20 tahun padahal pasal menulis 21, atau tegangan 25
volt yang tidak ada di pasal), sekitar 3 sebenarnya didukung tetapi dinilai rendah oleh NLI
(misalnya kalimat yang diawali "Berdasarkan kutipan,"), dan sisanya tidak jelas. Pemeriksaan ini
dilakukan satu orang (asisten pengembang) dan belum independen.

Saringan tambahan yang mencoba membuang kalimat berisi angka yang tidak ada di pasal yang dikutip
juga diuji secara informal (tidak termasuk aturan): dukungan k3 (1,5B) naik ke 73%, masih di
bawah 80%.

Kesimpulan putaran 1: masalah utamanya kemampuan model 1,5B dan 0,5B, bukan hanya prompt.

## Aturan putaran 2 (ditulis sebelum model lain dijalankan)

Kode: `choose_config` di `src/evidence/generation.py`, diuji.

- Kandidat: prompt bertahan, k1, k3 dengan Qwen2.5-1.5B (model situs sekarang), Qwen3-1.7B,
  dan Qwen3-4B (q4f16, onnx-community, Apache-2.0, mode berpikir dimatikan).
- Ukuran utama dan syarat sama dengan putaran 1, dengan pembanding bertahan + Qwen2.5-1.5B.
- Seri (selisih 1 pertanyaan atau kurang): unduhan lebih kecil, lalu prompt lebih sederhana.
- Tetap dev saja. Bila tidak ada yang lolos, keputusan lokasi model (peramban atau server gratis
  dengan model lebih besar) dikembalikan ke pemilik proyek.

## Hasil putaran 2

Belum ada.
