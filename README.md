# Industrial Evidence Copilot

**Status: RAG Research Prototype (ditutup 27 Oktober 2026).** Tanya jawab atas 15 peraturan keselamatan dan kesehatan kerja (K3) Indonesia. Situs publik menjawab dengan **kutipan langsung** dari pasal yang dapat diperiksa. Pipeline **RAG generatif** (BM25, reranker cross-encoder, Llama 3.3 70B di Cloudflare Workers AI, sitasi per kalimat, pemeriksaan sitasi, penilai NLI) sudah dibangun dan dievaluasi lengkap, tetapi tidak dijadikan jawaban publik karena gagal satu kriteria lolos pada evaluasi akhir (holdout v2).

| Mode | Cara kerja | Status |
| --- | --- | --- |
| Kutipan langsung | BM25 dengan stemmer Indonesia dan konteks bab, gerbang skor, lalu ayat atau butir disalin dari pasal peringkat 1; tidak generatif | **aktif di Production**, mode utama |
| Generatif dengan model server | BM25, reranker mMiniLM di peramban, empat pasal ke Llama 3.3 70B Instruct (FP8) di Workers AI lewat Pages Function `/api/jawab`, kalimat tanpa sitasi sah dibuang | **prototipe riset**: tidak aktif di domain produksi (fungsi menolak dan panel tidak menawarkannya); tetap berjalan di deploy Preview |
| Generatif dengan model lokal | sama, dengan Qwen2.5 1,5B (WebGPU) atau 0,5B (CPU) di perangkat pengunjung | prototipe riset, tidak lolos batas mutu dev; hanya di deploy Preview |

- Production: https://industrial-evidence-copilot.pages.dev/ (kutipan langsung)
- Deploy riset (Preview cabang pengembangan, mode generatif dapat dipilih): https://claude-project-thread-8fnhl3.industrial-evidence-copilot.pages.dev/
- Biaya: $0. Workers AI memakai paket Workers Free; bila kuota harian habis, permintaan ditolak, bukan ditagih.

## Evaluasi akhir: holdout v2 (keputusan penutupan)

120 pertanyaan baru (90 terjawab, 30 tanpa dasar) dari penulis terpisah, hash dikunci sebelum run, dijalankan **sekali** pada 27 Oktober 2026 dengan konfigurasi, prompt, model, ambang, dan penilaian yang dibekukan (`eval/holdout-v2/hasil.json`, [docs/holdout-v2-hasil.md](docs/holdout-v2-hasil.md)).

| Kriteria (alur v2) | Syarat | Hasil | Status |
| --- | --- | --- | --- |
| Jawaban generatif benar | ≥ 70% | 63 dari 90 (70,0%) | lolos, tepat di ambang |
| Lebih baik dari kutipan langsung | lebih tinggi | 63 lawan 48 | lolos |
| Pertanyaan tanpa dasar dijawab keliru | ≤ 10% | 0 dari 30 | lolos |
| Jawaban yang semua sitasinya tepat | ≥ 90% | 62 dari 70 (88,6%) | **gagal** |
| Kalimat tanpa sitasi yang ditampilkan | 0 | 0 | lolos |

**Keputusan: FAIL**, jadi mode generatif tetap prototipe riset. Perbandingan pada pertanyaan yang sama: alur v1 benar 56 dari 90, alur v2 63 dari 90, kutipan langsung 48 dari 90 (kutipan langsung juga menjawab 10 dari 30 pertanyaan tanpa dasar). Tanpa 3 pertanyaan yang kebetulan identik dengan set lain, alur v2 benar 62 dari 89 (69,7%) dan sitasi tepat 88,4%. Riwayat yang menuju keputusan ini: [ROOT_CAUSE_ANALYSIS.md](ROOT_CAUSE_ANALYSIS.md) (analisis set tersegel), [docs/penilaian-v2.md](docs/penilaian-v2.md) (penilaian dan kriteria yang dibekukan), [docs/alur-v2.md](docs/alur-v2.md) (perbaikan di dev).

## Riwayat evaluasi sebelumnya

Angka di bawah memakai alur v1 dan penilaian v1. Disimpan apa adanya sebagai jejak.

### Data uji (96 pertanyaan terjawab dan 21 tanpa dasar)

| Ukuran | Generatif server | Kutipan langsung |
| --- | --- | --- |
| Jawaban benar (pasal tepat dan fakta kunci ada) | 72 dari 96 (75%) | 56 dari 96 (58%) |
| Menolak padahal ada jawabannya | 17 dari 96 | 15 dari 96 |
| Pertanyaan tanpa dasar yang dijawab | 0 dari 21 | 0 dari 21 |
| Kalimat yang didukung pasal yang dikutipnya (penilai NLI) | 108 dari 123 (88%) | disalin, tidak dinilai |
| Jawaban yang semua sitasinya tepat | 65 dari 79 (82%) | tidak berlaku |
| Uji tekanan: pertanyaan panjang di luar korpus yang dijawab | 0 dari 12 | 7 dari 12 |
| Prompt injection: jawaban tampil yang aman (tinjauan manual) | 11 dari 11 yang sampai ke model | tidak berlaku |

Pencarian untuk mode generatif (BM25 + reranker mMiniLM): pasal tepat di peringkat 1 pada 93% pertanyaan uji (interval 95%: 88 sampai 98%), MRR@10 0,951. Kutipan langsung (BM25 saja): 68%.

Angka ini **optimistis**: 221 pertanyaan ditulis oleh asisten AI pengembang (bukan praktisi K3), data uji sudah dilihat sebelum desain akhir, aturan pemilihan sistem pencarian generatif ditetapkan setelah angka semua sistem terlihat, dan "didukung" dinilai model NLI otomatis. Model server dipilih dari data dev dengan aturan yang ditulis sebelum eksperimen ([docs/eksperimen-prompt.md](docs/eksperimen-prompt.md)). Protokol dan batas: [docs/evaluasi.md](docs/evaluasi.md).

### Set uji tersegel (70 pertanyaan terjawab dan 30 tanpa dasar)

Ditulis agen AI terpisah yang tidak melihat keluaran sistem, hash dikunci sebelum run, dijalankan sekali pada 26 Oktober 2026 (`eval/sealed/hasil.json`). Tidak ada yang disetel dari set ini. Hasilnya jauh lebih rendah daripada data uji; analisis penyebabnya ada di ROOT_CAUSE_ANALYSIS.md.

| Ukuran | Generatif server | Kutipan langsung |
| --- | --- | --- |
| Jawaban benar | 36 dari 70 (51%; interval 95%: 40 sampai 63%) | 30 dari 70 (43%) |
| Menolak padahal ada jawabannya | 20 dari 70 | 17 dari 70 |
| Pertanyaan tanpa dasar yang dijawab | 2 dari 30 | 12 dari 30 |
| Kalimat yang didukung pasal yang dikutipnya (penilai NLI) | 56 dari 68 (82%) | disalin, tidak dinilai |
| Jawaban dengan minimal satu sitasi sah | 49 dari 50 (98%) | tidak berlaku |
| Jawaban yang semua sitasinya tepat | 46 dari 50 (92%) | tidak berlaku |
| Kalimat tanpa sitasi yang ditampilkan | 0 | tidak berlaku |

Pencarian untuk mode generatif (BM25 + reranker mMiniLM) pada set ini: pasal tepat di peringkat 1 pada 89% pertanyaan terjawab, MRR@10 0,909. Kutipan langsung (BM25 saja): 66%. Jadi penurunan jawaban benar terutama berasal dari penolakan (gerbang skor dan model) dan fakta kunci yang tidak tertulis, bukan dari pencarian.

## Data dan lisensi

15 peraturan dari JDIH Kementerian Ketenagakerjaan, 622 pasal, setiap PDF dicatat dengan SHA-256. Enam peraturan lain dikeluarkan karena berupa pindaian yang tidak layak dikutip. Peraturan perundang-undangan bukan objek hak cipta menurut Pasal 42 huruf b UU 28/2014; rujukan ini baru terverifikasi dari sumber sekunder dan perlu dicek manual. Bukan nasihat hukum. Lihat [docs/kartu-data.md](docs/kartu-data.md).

Kode: MIT. Font: lisensi masing-masing di `web/public/fonts/`. Model server: Llama 3.3 Community License (Built with Llama). Reranker mMiniLM dan model Qwen: Apache 2.0.

## Cara kerja

PDF resmi → teks per pasal → BM25 dengan stemmer Indonesia dan konteks judul/bab → gerbang skor (ambang 14,0 dari dev) → reranker cross-encoder mMiniLM menilai ulang 20 pasal teratas di peramban → empat pasal ke model bahasa dengan prompt yang memperlakukan pasal dan pertanyaan sebagai data → sitasi diperiksa, kalimat tanpa sitasi sah dan tautan luar dibuang. Bila tidak ada kalimat yang tersisa, situs memakai kutipan langsung. Embedding e5 (tiga ukuran), hibrida, dan reranker bge-m3 juga dievaluasi; mMiniLM dipilih karena paling baik dan cukup kecil untuk peramban. Lihat [docs/kartu-model.md](docs/kartu-model.md) (Model Card), [docs/kartu-metode.md](docs/kartu-metode.md), [docs/arsitektur.md](docs/arsitektur.md), dan [docs/deploy.md](docs/deploy.md) untuk perlindungan `/api/jawab`.

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
docs/        kartu data, kartu model, kartu metode, evaluasi, holdout v2, keamanan, audit, arsitektur, reproduksi, deploy
tools/       fixture paritas, pemeriksa situs terbit
```

## Keamanan

Ringkasan pemeriksaan (dependensi, secret, header, endpoint `/api/jawab`): [docs/keamanan.md](docs/keamanan.md).
