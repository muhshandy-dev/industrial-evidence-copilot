# Industrial Evidence Copilot

Tanya jawab atas 15 peraturan keselamatan dan kesehatan kerja (K3) Indonesia dengan RAG generatif. Sistem mencari pasal yang relevan, model bahasa menulis jawaban singkat dari pasal itu, dan setiap kalimat wajib menunjuk pasal sumbernya. Kalimat tanpa sitasi yang sah dibuang sebelum ditampilkan. Bila skor pencarian terlalu rendah atau model menjawab "TIDAK DITEMUKAN", sistem menolak menjawab.

Situs punya tiga mode, dan label di atas setiap jawaban menyebut mode yang dipakai:

| Mode | Cara kerja | Status |
| --- | --- | --- |
| Generatif dengan model server (utama) | BM25 + reranker mMiniLM di peramban, empat pasal teratas ke Llama 3.3 70B Instruct (FP8) di Cloudflare Workers AI lewat Pages Function `/api/jawab` | pilihan pengunjung; butuh unduhan reranker sekitar 510 MB sekali |
| Generatif dengan model lokal (opsional) | sama, tetapi Qwen2.5 1,5B (WebGPU) atau 0,5B (CPU) berjalan di perangkat pengunjung | tidak lolos batas mutu; ditawarkan sebagai opsi saja |
| Kutipan langsung (bawaan, cadangan) | BM25, lalu ayat atau butir disalin dari pasal peringkat 1; tidak generatif | dipakai bila mode generatif tidak dipilih, kuota habis, atau model gagal |

- Situs: https://industrial-evidence-copilot.pages.dev/ (Production masih versi kutipan langsung; versi generatif menunggu persetujuan di PR #2)
- Biaya: paket Workers Free ($0). Kuota gratis harian (10.000 neuron) cukup untuk puluhan jawaban server per hari untuk semua pengunjung. Bila habis, Workers AI mengembalikan galat, bukan tagihan, dan situs kembali ke kutipan langsung sampai 07.00 WIB.

## Hasil (data uji, 96 pertanyaan terjawab dan 21 tanpa dasar)

| Ukuran | Generatif server (utama) | Kutipan langsung |
| --- | --- | --- |
| Jawaban benar (pasal tepat dan fakta kunci ada) | 72 dari 96 (75%) | 56 dari 96 (58%) |
| Menolak padahal ada jawabannya | 17 dari 96 | 15 dari 96 |
| Pertanyaan tanpa dasar yang dijawab | 0 dari 21 | 0 dari 21 |
| Kalimat yang didukung pasal yang dikutipnya (penilai NLI) | 108 dari 123 (88%) | disalin, tidak dinilai |
| Jawaban yang semua sitasinya tepat | 65 dari 79 (82%) | tidak berlaku |
| Uji tekanan: pertanyaan panjang di luar korpus yang dijawab | 0 dari 12 | 7 dari 12 |
| Prompt injection: jawaban tampil yang aman (tinjauan manual) | 11 dari 11 yang sampai ke model | tidak berlaku |

Pencarian untuk mode generatif (BM25 + reranker mMiniLM): pasal tepat di peringkat 1 pada 93% pertanyaan uji (interval 95%: 88 sampai 98%), MRR@10 0,951. Kutipan langsung (BM25 saja): 68%.

Angka ini **optimistis**: 221 pertanyaan ditulis oleh asisten AI pengembang (bukan praktisi K3), data uji sudah dilihat sebelum desain akhir, aturan pemilihan sistem pencarian generatif ditetapkan setelah angka semua sistem terlihat, dan "didukung" dinilai model NLI otomatis. Model server dipilih dari data dev dengan aturan yang ditulis sebelum eksperimen ([docs/eksperimen-prompt.md](docs/eksperimen-prompt.md)). Set uji tersegel (100 pertanyaan dari penulis terpisah) dijalankan satu kali; hasilnya dicantumkan di halaman Evaluasi setelah dijalankan. Protokol dan batas: [docs/evaluasi.md](docs/evaluasi.md).

## Data dan lisensi

15 peraturan dari JDIH Kementerian Ketenagakerjaan, 622 pasal, setiap PDF dicatat dengan SHA-256. Enam peraturan lain dikeluarkan karena berupa pindaian yang tidak layak dikutip. Peraturan perundang-undangan bukan objek hak cipta menurut Pasal 42 huruf b UU 28/2014; rujukan ini baru terverifikasi dari sumber sekunder dan perlu dicek manual. Bukan nasihat hukum. Lihat [docs/kartu-data.md](docs/kartu-data.md).

Kode: MIT. Font: lisensi masing-masing di `web/public/fonts/`. Model server: Llama 3.3 Community License (Built with Llama). Reranker mMiniLM dan model Qwen: Apache 2.0.

## Cara kerja

PDF resmi → teks per pasal → BM25 dengan stemmer Indonesia dan konteks judul/bab → gerbang skor (ambang 14,0 dari dev) → reranker cross-encoder mMiniLM menilai ulang 20 pasal teratas di peramban → empat pasal ke model bahasa dengan prompt yang memperlakukan pasal dan pertanyaan sebagai data → sitasi diperiksa, kalimat tanpa sitasi sah dan tautan luar dibuang. Bila tidak ada kalimat yang tersisa, situs memakai kutipan langsung. Embedding e5 (tiga ukuran), hibrida, dan reranker bge-m3 juga dievaluasi; mMiniLM dipilih karena paling baik dan cukup kecil untuk peramban. Lihat [docs/kartu-metode.md](docs/kartu-metode.md), [docs/arsitektur.md](docs/arsitektur.md), dan [docs/deploy.md](docs/deploy.md) untuk perlindungan `/api/jawab`.

## Menjalankan

```
pip install -e ".[dev]"
evidence eval-set check   # validasi pertanyaan dan label test yang dibekukan
evidence eval             # hitung ulang eval/results.json (deterministik)
evidence export           # data situs di web/public/data
pytest

cd web && npm ci
npm test && npm run build
npx playwright install chromium && npm run e2e
node tests/serve.mjs      # http://127.0.0.1:8788
```

Mengunduh ulang PDF dan membangun korpus dari nol: [docs/reproduksi.md](docs/reproduksi.md). Deploy: [docs/deploy.md](docs/deploy.md) (Cloudflare Pages, output `web/public`, tanpa build, binding Workers AI `AI`).

## Struktur

```
corpus/      manifest sumber dan korpus per pasal
eval/        pertanyaan beku, uji tekanan, hasil evaluasi
src/evidence pipeline Python (ingest, BM25, dense, reranker, jawaban, generatif, evaluasi, ekspor)
functions/   Pages Function /api/jawab (Workers AI)
server/      verifikasi token OIDC untuk jalur evaluasi
web/public   situs statis (HTML, CSS, JS modul, data)
docs/        kartu data, kartu metode, evaluasi, audit, arsitektur, reproduksi, deploy
tools/       fixture paritas, pemeriksa situs terbit
```
