# Model Card: Industrial Evidence Copilot

Status proyek: **RAG Research Prototype** (ditutup 27 Oktober 2026). Kartu ini mencakup semua model yang dipakai sistem, termasuk yang tidak aktif di domain produksi.

## Tujuan dan penggunaan

Membantu orang menemukan pasal yang relevan dalam 15 peraturan K3 Indonesia dan membaca bunyi pasalnya. Proyek ini adalah portofolio dan riset tentang RAG dengan sitasi yang dapat diperiksa.

**Bukan untuk** nasihat hukum, keputusan sanksi, audit kepatuhan, atau keputusan keselamatan. Peraturan dapat sudah diubah atau dicabut setelah tanggal akses korpus. Rujuk selalu ke PDF resmi.

## Komponen dan model

| Komponen | Model atau metode | Versi yang dipatok | Lisensi | Status di Production |
|---|---|---|---|---|
| Pencarian | BM25 Okapi (k1 1,2, b 0,75) dengan stemmer Indonesia dan konteks judul/bab | kode di repo, paritas Python dan JS diuji | MIT | aktif |
| Gerbang penolakan | ambang skor BM25 14,0 (dipilih di dev) | `eval/results.json` | MIT | aktif |
| Jawaban kutipan langsung | pemilihan ayat atau butir dari pasal peringkat 1, disalin persis | `answer.py`, `answer.js` | MIT | **aktif, mode utama** |
| Reranker | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` (fp32, di peramban) | revisi `1427fd65` | Apache-2.0 | tidak aktif |
| Model bahasa server | Llama 3.3 70B Instruct FP8 (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) di Workers AI, prompt `bertahan`, suhu 0, seed 42, maksimal 220 token, 4 pasal | nama model (Workers AI tidak memberi nomor revisi bobot) | Llama 3.3 Community License | **tidak aktif** (prototipe riset, hanya Preview) |
| Model bahasa lokal | Qwen2.5 1,5B Instruct (WebGPU) dan 0,5B (CPU), ONNX | revisi `d54957e3` dan `22942cb7` | Apache-2.0 | tidak aktif |
| Penilai groundedness (evaluasi saja) | `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` | dipatok di `generation.py` | MIT | tidak dipakai situs |

Alur generatif v2: skor BM25 atau skor reranker pasal peringkat 1 harus mencapai ambangnya (14,0 atau 1,0), pasal lebih dari 1.800 karakter diringkas menjadi ayat yang relevan, model diminta menjawab hanya dari pasal dan menulis "TIDAK DITEMUKAN" bila tidak ada dasar, lalu kalimat tanpa sitasi sah dan tautan luar dibuang sebelum ditampilkan.

## Data

Korpus: 15 peraturan K3 dari JDIH Kementerian Ketenagakerjaan, 622 pasal, setiap PDF dengan SHA-256 ([kartu-data.md](kartu-data.md)). Tidak ada model yang dilatih atau di-fine-tune di proyek ini; semua model dipakai apa adanya. Yang disetel hanya ambang, prompt, dan pilihan model, semuanya di data dev.

Set evaluasi (semua ditulis asisten AI, bukan praktisi K3):

| Set | Isi | Dipakai untuk |
|---|---|---|
| dev | 65 terjawab, 39 tanpa dasar | memilih ambang, prompt, model, dan alur v2 |
| test | 96 terjawab, 21 tanpa dasar | pelaporan; sudah dilihat sebelum desain akhir (semi-holdout) |
| tersegel | 70 terjawab, 30 tanpa dasar, penulis terpisah | dijalankan sekali 26 Oktober 2026 |
| holdout v2 | 90 terjawab, 30 tanpa dasar, penulis terpisah | dijalankan sekali 27 Oktober 2026, keputusan akhir |

## Hasil utama

Evaluasi akhir, holdout v2 (penilaian v2, pertanyaan yang sama untuk ketiga sistem):

| Ukuran | Kutipan langsung | Generatif alur v1 | Generatif alur v2 |
|---|---|---|---|
| Jawaban benar | 48 dari 90 (53,3%) | 56 dari 90 (62,2%) | 63 dari 90 (70,0%) |
| Benar di antara yang dijawab | 48 dari 75 (64,0%) | 56 dari 65 (86,2%) | 63 dari 70 (90,0%) |
| Pertanyaan tanpa dasar yang dijawab | 10 dari 30 | 0 dari 30 keliru | 0 dari 30 keliru |
| Jawaban yang semua sitasinya tepat | tidak berlaku | 56 dari 65 (86,2%) | 62 dari 70 (88,6%) |
| Kalimat yang didukung pasal (NLI) | disalin | 75 dari 100 | 76 dari 100 |

Kriteria lolos yang dibekukan sebelum run: benar ≥ 70% dan lebih tinggi dari kutipan, tanpa dasar keliru ≤ 10%, semua sitasi tepat ≥ 90%, 0 kalimat tanpa sitasi. **Hasil: FAIL** pada kriteria sitasi. Rincian: [holdout-v2-hasil.md](holdout-v2-hasil.md).

Riwayat (alur v1, penilaian v1): set tersegel benar 36 dari 70 (51%), kutipan 30 dari 70; data uji benar 72 dari 96, kutipan 56 dari 96. Penurunan dari data uji ke set tersegel dianalisis di [ROOT_CAUSE_ANALYSIS.md](../ROOT_CAUSE_ANALYSIS.md).

## Keterbatasan dan risiko

- **Sitasi tambahan.** Model sering menambah kalimat yang mengutip pasal terkait di luar label. Isinya sering benar, tetapi sitasinya tidak dapat dipertanggungjawabkan sebagai dasar jawaban. Inilah penyebab kegagalan kriteria.
- **Kalimat tidak didukung.** Sekitar seperempat kalimat generatif pada holdout v2 tidak dinilai didukung oleh penilai NLI. Penilai otomatis juga bisa keliru, terutama untuk angka.
- **Kutipan langsung tidak mengarang, tetapi bisa salah pasal** dan lebih sering menjawab pertanyaan tanpa dasar (10 dari 30 pada holdout v2).
- **Bias penulis pertanyaan.** Semua set ditulis asisten AI, bukan praktisi K3.
- **Model server tidak dapat dikunci versinya** di Workers AI; hasil dapat bergeser bila penyedia memperbarui bobot.
- **Korpus terbatas** pada 15 peraturan yang teksnya layak; peraturan pindaian dikeluarkan.
- **Ejaan dan OCR.** Beberapa teks berasal dari OCR dan dapat memuat salah baca.

## Privasi dan biaya

Di domain produksi pertanyaan diproses di peramban dan tidak dikirim ke server. Di deploy Preview, mode generatif server mengirim pertanyaan dan nomor pasal ke Workers AI; situs tidak menyimpan pertanyaan. Biaya $0: paket Workers Free menolak permintaan setelah kuota harian habis, tidak menagih.

## Pertimbangan etis

Jawaban tentang keselamatan kerja yang keliru dapat merugikan pekerja. Karena itu mode utama hanya menyalin bunyi pasal, setiap jawaban menunjuk pasal sumber, sistem menolak bila dasar tidak cukup, dan mode generatif tidak diaktifkan untuk publik setelah gagal kriteria sitasi.
