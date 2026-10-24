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

## Hasil

Belum ada. Bagian ini diisi dari `eval/eksperimen-prompt.json` setelah run selesai.
