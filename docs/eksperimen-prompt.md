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

Dev, 53 pertanyaan yang sama. Kolom sama dengan putaran 1. Waktu = median detik per jawaban di
runner CPU GitHub Actions (bukan waktu di perangkat pengguna).

| Konfigurasi | Generatif benar | Mode generatif | Tak terjawab yang dijawab | Didukung NLI | Waktu CPU |
| --- | --- | --- | --- | --- | --- |
| bertahan, Qwen2.5-1.5B (pembanding) | 0 | 0 | 0 | 0 dari 0 | |
| k1, Qwen2.5-1.5B | 10 | 24 | 1 | 20 dari 37 (54%) | |
| k3, Qwen2.5-1.5B | 20 | 40 | 2 | 27 dari 41 (66%) | |
| bertahan, Qwen3-1.7B | 2 | 9 | 1 | 6 dari 15 (40%) | 78 |
| k1, Qwen3-1.7B | 4 | 17 | 1 | 8 dari 26 (31%) | 85 |
| k3, Qwen3-1.7B | 2 | 5 | 1 | 2 dari 5 (40%) | 90 |
| bertahan, Qwen3-4B | 11 | 22 | 1 | 18 dari 30 (60%) | 149 |
| k1, Qwen3-4B | 10 | 17 | 1 | 9 dari 23 (39%) | 169 |
| k3, Qwen3-4B | 7 | 17 | 1 | 12 dari 21 (57%) | 171 |

Sumber: `eval/eksperimen-prompt.json` (`terpilih_putaran_2`).

**Menurut aturan putaran 2, tidak ada konfigurasi yang lolos.** Semua kandidat Qwen3 menjawab satu
pertanyaan tak terjawab (pembanding: 0), dan tidak ada yang mencapai 80% kalimat didukung NLI.
Qwen3-4B memang menulis sitasi yang lebih rapi (21 dari 22 jawaban generatif bersitasi sah untuk
prompt bertahan), tetapi hanya 60% kalimatnya didukung, unduhannya sekitar 2,8 GB (q4f16), dan
satu jawaban butuh sekitar 2,5 menit di CPU runner.

Kesimpulan putaran 2: model yang muat di peramban (sampai 4B) belum memenuhi standar kebenaran
yang ditetapkan. Keputusan lokasi model dikembalikan ke pemilik proyek, sesuai aturan di atas.

**Koreksi (ditemukan setelah keputusan diambil):** mode berpikir Qwen3 ternyata tidak mati. Semua
318 keluaran Qwen3 diawali blok `<think>`, dan hanya 108 yang menutupnya sebelum batas 220 token.
Opsi `enable_thinking: false` yang diteruskan lewat `tokenizer_kwargs` tidak dipakai oleh pipeline
transformers.js 4.3.1. Jadi angka Qwen3 di atas meremehkan model itu dan tidak boleh dibaca sebagai
kemampuannya. Angka Qwen2.5 (putaran 1) tidak terpengaruh. Alasan lain untuk tidak memakai Qwen3-4B
di peramban tetap berlaku (unduhan 2,8 GB, sekitar 2,5 menit per jawaban di CPU), tetapi
perbandingan kualitas yang adil belum dilakukan.

## Aturan putaran 3 (ditulis sebelum model server mana pun dijalankan)

Pemilik proyek memilih memindahkan generasi ke Cloudflare Workers AI (kuota gratis harian, tanpa
tagihan selama akun di paket Workers Free). Kode: `choose_server` di `src/evidence/generation.py`,
diuji.

- Kandidat: prompt bertahan dan k3 dengan tiga model Workers AI:
  `@cf/meta/llama-4-scout-17b-16e-instruct`, `@cf/mistralai/mistral-small-3.1-24b-instruct`, dan
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`. Suhu 0, seed tetap, batas 220 token.
- Ukuran utama dan syarat sama dengan putaran 1 dan 2, dengan pembanding bertahan + Qwen2.5-1.5B.
- Seri (selisih 1 pertanyaan atau kurang): prompt bertahan lebih dulu, lalu model dengan perkiraan
  neuron per jawaban paling sedikit (urutan perkiraan dari tarif yang diterbitkan Cloudflare:
  Llama 4 Scout, Mistral Small 3.1 24B, Llama 3.3 70B), karena lebih murah berarti lebih banyak
  pertanyaan per hari dari kuota gratis.
- Perubahan kandidat sebelum hasil apa pun terlihat: kandidat awal `@cf/google/gemma-3-12b-it`
  ditolak Workers AI untuk akun ini ("5018: This account is not allowed to access"), jadi diganti
  `@cf/mistralai/mistral-small-3.1-24b-instruct` (Apache-2.0, tarif neuron hampir sama). Satu-
  satunya keluaran yang sudah terlihat saat itu adalah dua jawaban uji asap Llama 4 Scout.
- Tetap dev saja. Konfigurasi yang belum lengkap (misalnya terpotong kuota) tidak dipilih.
- Bila tidak ada yang lolos, hasilnya dilaporkan ke pemilik proyek sebelum langkah lain.

Catatan: Workers AI tidak menerbitkan nomor revisi bobot, jadi nama model adalah patokannya, dan
suhu 0 tidak menjamin keluaran yang persis sama di setiap panggilan. Keluaran mentah di-commit
supaya angka dapat dihitung ulang.

Workflow `Eksperimen model server` (dispatch) memanggil `/api/jawab` di deploy Preview (binding AI
yang sama dengan situs; Preview boleh memilih kandidat model, produksi tidak). Jalur cadangan: REST
API dengan secret `CLOUDFLARE_ACCOUNT_ID` dan
`CLOUDFLARE_API_TOKEN`. Bila kuota habis di tengah jalan, keluaran yang sudah ada di-commit dan run
berikutnya melanjutkan.
