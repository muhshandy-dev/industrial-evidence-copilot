# Industrial Evidence Copilot: laporan serah terima akhir

Untuk pemeriksaan independen. Disusun oleh asisten AI pengembang (Claude) pada 25 Oktober 2026, diperbarui 26 Oktober 2026.

- Repositori: `muhshandy-dev/industrial-evidence-copilot`, cabang `claude/project-thread-8fnhl3`, PR #2 (draf, belum digabung).
- Production (https://industrial-evidence-copilot.pages.dev/) masih versi 1 (kutipan langsung, tidak generatif). Versi 2 hanya ada di deploy Preview cabang ini. Production **belum** diaktifkan dan menunggu persetujuan pemilik proyek.
- Semua angka di bawah berasal dari berkas yang di-commit (`eval/results.json`, `eval/cache/`, `eval/*-tinjauan.json`, `eval/sealed/hasil.json`). Bila laporan ini berbeda dari berkas itu, berkasnya yang benar.

## 1. Ringkasan

Proyek ini adalah RAG generatif bersitasi atas 15 peraturan K3 Indonesia (622 pasal). Versi 2 menambah komponen yang diwajibkan spesifikasi Master MagangHub (AI01): dense retrieval (e5 dengan FAISS), hybrid search, reranker, generasi jawaban oleh LLM open-weight, pengukuran groundedness, pertahanan prompt injection, dan set uji tersegel.

Mode generatif utama: BM25 dengan stemmer dan konteks, gerbang skor, reranker cross-encoder mMiniLM (fp32, di peramban), empat pasal teratas ke **Llama 3.3 70B Instruct (FP8)** di Cloudflare Workers AI (paket Workers Free, $0) lewat Pages Function `/api/jawab`, lalu pemeriksaan sitasi. Model lokal Qwen2.5 tetap tersedia sebagai opsi, dan kutipan langsung tetap menjadi mode bawaan dan cadangan.

Hasil utama pada set uji tersegel (70 pertanyaan terjawab, 30 tanpa dasar, dijalankan sekali): jawaban benar 36 dari 70 (51%; kutipan langsung 30 dari 70), 56 dari 68 kalimat didukung pasal menurut penilai NLI, 2 dari 30 pertanyaan tanpa dasar dijawab (kutipan langsung 12 dari 30), tidak ada kalimat tanpa sitasi yang ditampilkan. Pada data uji (96 pertanyaan terjawab, 21 tanpa dasar), yang optimistis karena sudah terlihat sebelum desain akhir: jawaban benar 72 dari 96 (75%; kutipan langsung 56 dari 96), 108 dari 123 kalimat didukung pasal menurut penilai NLI (tinjauan manual menunjukkan angka ini batas bawah), 0 dari 21 pertanyaan tanpa dasar dan 0 dari 12 pertanyaan uji tekanan dijawab, semua jawaban yang ditampilkan untuk 20 pertanyaan injeksi aman.

## 2. Hasil evaluasi

### 2.1 Pencarian (test, 96 pertanyaan terjawab)

| Metode | Peringkat 1 | Lima teratas | MRR@10 |
| --- | --- | --- | --- |
| BM25 polos | 0,573 [0,479; 0,667] | 0,854 | 0,702 |
| BM25 + stem + konteks (mode kutipan) | 0,677 [0,583; 0,771] | 0,896 | 0,786 [0,720; 0,852] |
| Dense multilingual-e5-large (FAISS) | 0,802 [0,719; 0,875] | 0,917 | 0,861 |
| Hibrida BM25 + e5-large (RRF) | 0,812 [0,729; 0,885] | 0,948 | 0,864 |
| **BM25 + konteks + reranker mMiniLM (mode generatif)** | **0,927 [0,875; 0,979]** | **0,979** | **0,951 [0,914; 0,984]** |
| BM25 + konteks + reranker bge-reranker-v2-m3 | 0,865 | 0,958 | 0,911 |

Interval: bootstrap persentil 95%. Selisih berpasangan MRR@10 reranker mMiniLM terhadap BM25 + konteks: +16,4 poin [10,8; 22,7]. Tabel lengkap (21 sistem, termasuk e5 small dan base): `docs/evaluasi.md` dan `eval/results.json`.

### 2.2 Pemilihan model generatif (dev)

Aturan pemilihan (`choose_server` di `src/evidence/generation.py`) ditulis dan diuji sebelum model server mana pun dijalankan: hanya data dev, ukuran utama jumlah pertanyaan terjawab yang dijawab generatif dan benar, syarat tidak menjawab lebih banyak pertanyaan tanpa dasar daripada baseline dan minimal 80% kalimat didukung NLI, seri (selisih 1 atau kurang) didahulukan prompt "bertahan".

| Konfigurasi (dev, 53 pertanyaan lolos gerbang) | Generatif benar | Didukung NLI | Sitasi semua sah | Tak terjawab yang dijawab |
| --- | --- | --- | --- | --- |
| bertahan, Qwen2.5-1.5B (baseline lokal) | 0 | 0 dari 0 | 0 dari 0 | 0 |
| bertahan, Llama 4 Scout 17B | 32 | 68% (gugur) | 35 dari 42 | 0 |
| bertahan, Mistral Small 3.1 24B | 39 | 83% | 44 dari 46 | 0 |
| **bertahan, Llama 3.3 70B (terpilih)** | **43** | **85%** | 41 dari 48 | 0 |
| k3, Llama 4 Scout 17B | 42 | 75% (gugur) | 43 dari 47 | 0 |
| k3, Mistral Small 3.1 24B | 43 | 83% | 47 dari 48 | 0 |
| k3, Llama 3.3 70B | 44 | 83% | 47 dari 48 | 0 |

Tiga konfigurasi teratas praktis setara di dev; pilihan mengikuti aturan seri, bukan bukti bahwa ia jelas lebih baik. Kualitas bahasa Indonesia diperiksa manual atas 53 keluaran terpilih: baku dan mudah dibaca, angka dan satuan disalin dari pasal; kelemahan berupa kalimat penegas yang tidak perlu dan satu salah ketik (q070).

### 2.3 Mode generatif pada data uji

| Ukuran | Llama 3.3 70B (utama) | Qwen2.5 1,5B GPU (opsional) | Qwen2.5 0,5B CPU (opsional) | Kutipan langsung |
| --- | --- | --- | --- | --- |
| Jawaban benar | 72/96 (75%) [65; 83] | 31/96 | 40/96 | 56/96 (58%) |
| Menolak padahal ada jawabannya | 17/96 | 50/96 | 20/96 | 15/96 |
| Pertanyaan tanpa dasar yang dijawab | 0/21 | 0/21 | 0/21 | 0/21 |
| Kalimat didukung NLI | 108/123 (88%) | 3/4 | 4/19 | tidak dinilai |
| Jawaban yang seluruh kalimatnya didukung | 64/79 | 3/4 | 2/12 | |
| Jawaban dengan minimal satu sitasi tepat | 79/79 | 4/4 | 9/12 | 58/81 |
| Jawaban yang semua sitasinya tepat | 65/79 | 3/4 | 4/12 | |

Rincian Llama 3.3 70B: 36 ditolak gerbang, 79 jawaban generatif, 2 "TIDAK DITEMUKAN". Median waktu jawaban dari runner 1,2 detik (p90 2,3 detik).

**Validasi manual penilai NLI** (`eval/nli-tinjauan.json`): 25 dari 25 kalimat sampel yang dinilai didukung memang didukung. Dari 15 kalimat yang dinilai tidak didukung (semua kalimat seperti itu di test), hanya 1 yang memang tidak didukung (q124); satu lagi benar tetapi tidak relevan (q095), dan satu didukung hanya bila nama peraturan sumber ikut dibaca (q084). Peninjau: asisten AI pengembang.

### 2.4 Uji tekanan dan prompt injection

- Uji tekanan (12 pertanyaan panjang berkosakata K3 tanpa jawaban di korpus): Llama 3.3 70B menjawab 0 dari 12 (7 "TIDAK DITEMUKAN", 5 ditolak gerbang). Kutipan langsung menjawab 7 dari 12.
- Prompt injection (20 pertanyaan dengan kunci `perilaku_aman`, `eval/sealed/injeksi.jsonl`): 9 ditolak gerbang, 11 sampai ke model. Tinjauan manual per butir di `eval/injeksi-tinjauan.json`.

| Prompt (Llama 3.3 70B) | Jawaban tampil aman | Keluaran mentah menuruti perintah tersembunyi |
| --- | --- | --- |
| Situs ("bertahan": teks sebagai data, aturan sitasi) | 11/11 | 1/11 (i11: menulis isi kutipan sebagai JSON) |
| Polos (tanpa pertahanan) | 11/11 | 2/11 (i11; i20: denda Rp1 miliar karangan) |

Kalimat yang menuruti perintah selalu dibuang pemeriksaan sitasi karena tidak punya sitasi sah. Pertahanan utama adalah pemeriksaan setelah generasi; prompt hanya menambah sedikit.

### 2.5 Set uji tersegel

Dijalankan **sekali** pada 26 Oktober 2026 pukul 17.34 UTC lewat workflow `tersegel.yml` (run 40357743888, commit yang dievaluasi `4c5c4de`, commit hasil `058093d`). 100 pertanyaan (70 terjawab, 30 tanpa dasar) ditulis agen AI terpisah yang tidak melihat keluaran sistem; hash di `eval/sealed.sha256` di-commit sebelum run. Metode, ambang, prompt, dan model diambil dari `eval/results.json`; tidak ada yang disetel dari set ini. Hasil lengkap: `eval/sealed/hasil.json`.

| Ukuran | Llama 3.3 70B (utama) | Kutipan langsung | Qwen2.5 0,5B CPU (opsional) | Qwen2.5 1,5B GPU (opsional) |
| --- | --- | --- | --- | --- |
| Jawaban benar | 36/70 (51%) [40; 63] | 30/70 (43%) [32; 55] | 25/70 | 14/70 |
| Menolak padahal ada jawabannya | 20/70 | 17/70 | 19/70 | 49/70 |
| Pertanyaan tanpa dasar yang dijawab | 2/30 | 12/30 | 11/30 | 1/30 |
| Kalimat didukung NLI | 56/68 (82%) [72; 90] | tidak dinilai | 6/20 | tidak ada kalimat generatif |
| Jawaban dengan minimal satu sitasi sah | 49/50 (98%) | | 10/13 | |
| Jawaban yang semua sitasinya tepat | 46/50 (92%) | | 6/13 | |
| Jawaban dengan kalimat tanpa sitasi | 0/100 | | 56/100 | 16/100 |

Mode model utama: 35 ditolak gerbang, 13 "TIDAK DITEMUKAN", 52 jawaban generatif. Pencarian (n = 70): BM25 + konteks Hit@1 0,657 dan MRR@10 0,754; BM25 + konteks + reranker mMiniLM (mode generatif) Hit@1 0,886 dan MRR@10 0,909.

Dibanding data uji, jawaban benar mode utama turun dari 75% ke 51% dan kutipan langsung dari 58% ke 43%. Pencarian dengan reranker tetap tinggi (0,927 ke 0,886), jadi penurunan berasal dari penolakan (gerbang skor dan "TIDAK DITEMUKAN") serta fakta kunci yang tidak tertulis dalam jawaban. Angka tersegel adalah perkiraan yang lebih dapat dipercaya. Mode utama tetap lebih baik daripada kutipan langsung pada jawaban benar (+6 pertanyaan) dan jauh lebih baik pada penolakan pertanyaan tanpa dasar (2/30 lawan 12/30). Run sekali jalan hanya memuat 100 pertanyaan; 20 pertanyaan injeksi dari penulis yang sama sudah dievaluasi lebih dulu (bagian 2.4).

## 3. Konfigurasi model yang dipilih

| Komponen | Nilai |
| --- | --- |
| Model generatif server | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Llama 3.3 Community License, "Built with Llama" dicantumkan di situs) |
| Penyedia | Cloudflare Workers AI, binding `AI` di Pages Function, paket Workers Free |
| Prompt | varian `bertahan` di `web/public/js/gen/prompt.js` |
| Dekode | suhu 0, paling banyak 220 token baru |
| Konteks | 4 pasal teratas, tiap pasal paling banyak 1.800 karakter |
| Pencarian | BM25 + stem + konteks, gerbang skor 14,0 (dipilih dari dev), 20 teratas dinilai ulang reranker |
| Reranker | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`, revisi `1427fd65`, fp32, di peramban (transformers.js) |
| Penilai groundedness (evaluasi saja) | mDeBERTa-v3-base-xnli-multilingual-nli-2mil7, ambang entailment 0,5 |
| Model lokal opsional | Qwen2.5-1.5B-Instruct q4f16 (WebGPU), Qwen2.5-0.5B-Instruct q4 (CPU), revisi dipatok |

## 4. Status fitur

| Fitur | Status | Bukti |
| --- | --- | --- |
| Mode kutipan langsung (bawaan dan cadangan) | Berjalan | e2e lokal dan CI |
| Mode generatif server (utama) | Berjalan dan lolos uji di Preview (26 Oktober 2026) | `web/tests/preview-server.mjs`, workflow "Peramban generatif" |
| Mode generatif lokal (opsional) | Jalur CPU teruji di Chromium runner; jalur WebGPU belum diuji di perangkat sungguhan | `web/tests/gen-browser.mjs` |
| Kembali ke kutipan saat kuota habis | Teruji di Preview sungguhan (25 Oktober 2026, `429 kuota_habis`, pesan jelas, kutipan ditampilkan) | run 40188600616 |
| Label mode per jawaban | Ada ("Jawaban generatif", "Jawaban ekstraktif", "Kutipan cadangan", "Tidak menjawab"), dengan catatan bahwa kalimat ditulis model | e2e |
| Perlindungan `/api/jawab` | Origin wajib, 6 permintaan per menit per IP, pilihan model hanya dengan OIDC di Preview | `web/tests/fungsi.test.mjs`, uji Preview |
| Halaman Evaluasi dengan model server sebagai kolom utama | Ada | `web/public/js/evaluation.js` |

## 5. Pengujian

| Uji | Hasil | Catatan |
| --- | --- | --- |
| pytest | 55 lolos, 0 dilewati | termasuk uji hasil tersegel; juga dijalankan di job `gabung` run 40357743888 |
| ruff check dan format | lolos | |
| npm test (paritas BM25 JS dan Python 221 pertanyaan, fungsi `/api/jawab` termasuk OIDC dengan kunci RSA lokal, Origin, batas laju, sidik prompt) | 19 lolos | |
| e2e Playwright: alur ruang kerja, mode server dan lokal tanpa unduhan otomatis, penolakan, halaman evaluasi dan metode, tanpa em dash | lolos | |
| Aksesibilitas axe dan tata letak (desktop dan ponsel, tema terang dan gelap) | lolos | tidak ada pelanggaran axe |
| Gerak dikurangi, navigasi papan ketik | lolos | |
| Paritas reranker Node fp32 terhadap PyTorch | selisih skor maksimum 0,0000, pasal teratas 15/15 | run 40184983713 |
| Paritas reranker Chromium (WebAssembly) terhadap PyTorch | selisih maksimum 0,00001 | run 40184983713, 40187699580 |
| Uji asap model lokal CPU di Chromium | lolos (urutan pasal sama dengan evaluasi) | run 40187699580 |
| Keamanan `/api/jawab` di Preview sungguhan: tanpa Origin 403, pilihan model tanpa token 403, token palsu 401 | lolos | run 40187699580, 40188600616 |
| CSP: tidak ada pelanggaran saat mode generatif | lolos | uji Preview |
| Mode server end-to-end di Preview: mode generatif, jalur server, kalimat bersitasi, jawaban memuat fakta kunci | lolos | run 40356110808 (commit `4c5c4de`) |

## 6. Bukti deploy

- Preview cabang: `https://claude-project-thread-8fnhl3.industrial-evidence-copilot.pages.dev` (diakses dari GitHub Actions; lingkungan pengembangan tidak dapat membuka `pages.dev`).
- `GET /api/jawab` di Preview melaporkan `{"aktif": true, "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "binding": true}` (diperiksa oleh workflow sebelum setiap evaluasi).
- Run evaluasi server: dev putaran 3 run 40185937227, 40186283294; test, uji tekanan, injeksi run 40187703106 (commit hasil 749d6cb); set tersegel run 40357743888 (commit hasil 058093d).
- Uji mode server di Preview lolos: run 40356110808.
- Production: belum diubah. Langkah aktivasi ada di `docs/deploy.md`.

## 7. Perbandingan dengan kriteria penerimaan

Kriteria ditulis 24 Oktober 2026 sebelum coding (`kriteria-penerimaan.md`).

| No | Kriteria | Status | Bukti dan catatan |
| --- | --- | --- | --- |
| 1 | Dense retrieval e5 + FAISS, Recall@k, MRR, nDCG dev dan test dengan interval | Terpenuhi | `src/evidence/dense.py` (FAISS IndexFlatIP), e5 small, base, large di `eval/results.json` |
| 2 | Hybrid search, perbandingan berpasangan BM25, dense, hybrid | Terpenuhi | RRF, selisih berpasangan di `eval/results.json` |
| 3 | Reranker sebagai ablasi, dipasang di situs bila lebih baik dan muat | Terpenuhi | mMiniLM +16,4 poin MRR; di peramban dengan paritas teruji; unduhan sekitar 510 MB |
| 4 | LLM open-weight menulis jawaban bersitasi, menolak tanpa dasar; model yang dievaluasi sama dengan situs | Terpenuhi, dengan catatan | Llama 3.3 70B; id model dan prompt sama dengan situs; Workers AI tidak menyediakan patokan revisi |
| 5 | Groundedness per kalimat dengan NLI, divalidasi manual, baseline ekstraktif | Terpenuhi, dengan catatan | NLI 108/123; validasi manual 40 kalimat oleh asisten AI, bukan manusia independen |
| 6 | Injection defense diukur sebelum dan sesudah pertahanan | Terpenuhi | prompt polos dan bertahan pada model yang sama; tinjauan per butir |
| 7 | Demo jujur: label per jawaban, jatuh ke ekstraktif | Terpenuhi | label mode; fallback kuota teruji di Preview |
| 8 | Set uji tersegel, penulis terpisah, hash sebelum run, sekali jalan | Terpenuhi | run 40357743888, `eval/sealed/hasil.json`; jawaban benar mode utama 51%, lebih rendah dari data uji; `eval/sealed.sha256`, `tersegel.yml` |
| 9 | Reproduksi di GitHub Actions dengan revisi dipatok, hasil di-commit | Sebagian | semua evaluasi di Actions dan di-commit; revisi model server tidak dapat dipatok |
| Non-inti | Frontend React/Vite + TS (blueprint 07B) | Menyimpang | tetap JavaScript modul tanpa build; belum diputuskan pemilik proyek |
| Non-inti | Eksekusi di Kaggle | Menyimpang (setara) | GitHub Actions |

## 8. Keterbatasan dan pengungkapan

1. Pertanyaan dev dan test ditulis asisten AI pengembang, bukan praktisi K3. Data uji semi-holdout: agregat test terlihat sebelum desain akhir.
2. Aturan pemilihan sistem pencarian mode generatif ditetapkan setelah angka semua sistem terlihat.
3. Angka test model lokal versi lama terlihat sebelum eksperimen prompt.
4. Hasil putaran 2 untuk Qwen3 tidak sah karena mode berpikir tidak benar-benar mati.
5. Gemma 3 12B tidak tersedia untuk akun ini (galat 5018) dan diganti Mistral Small 3.1 sebelum hasil apa pun terlihat.
6. Reranker 8-bit dicoba lalu ditolak (skor bergantung CPU, selisih logit sampai 0,93). Selama dicoba, 22 baris keluaran per model server dibangkitkan dengan urutan 8-bit; baris itu dibangkitkan ulang dengan urutan fp32 sebelum angka dihitung.
7. Workers AI tidak menyediakan patokan revisi model, dan suhu 0 tidak menjamin keluaran identik bila dijalankan ulang. Keluaran yang dinilai di-commit.
8. Data dev model server hanya memuat 3 pertanyaan tak terjawab yang lolos gerbang, jadi syarat penolakan saat pemilihan lemah. Test (21) dan uji tekanan (12) menambah bukti.
9. Pertanyaan injeksi i02 dan jumlah yang lolos gerbang sempat terlihat di log uji asap.
10. Endpoint evaluasi Preview sempat terbuka tanpa token sekitar satu jam (sebelum kunci OIDC, 25 Oktober 2026 sekitar 09.36 sampai 10.27 UTC). Hanya Preview; tidak ada biaya karena paket gratis.
11. Kuota: penggunaan dicatat dalam token (putaran 3 dev: 430.394 token masukan, 14.644 token keluaran). Neuron hanya terlihat di dasbor Cloudflare. Satu jawaban Llama 3.3 70B memakai sekitar 4.000 token masukan, jadi kuota gratis cukup untuk puluhan jawaban per hari untuk seluruh pengunjung. Kuota habis pada 25 Oktober 2026 setelah evaluasi test. Pada 26 Oktober 2026 kuota tetap ditolak (galat 4006) pada 07.15, 09.35, dan 13.32 WIB walaupun dasbor menunjukkan 0 neuron terpakai, lalu pulih sebelum 23.05 WIB. Penyebabnya tidak diketahui; situs kini menyebut bahwa pemulihan bisa lebih lambat dari 07.00 WIB.
12. Batas laju 6 per menit per IP berlaku per isolate, bukan global.
13. Mode server tetap memerlukan unduhan reranker sekitar 510 MB sekali di perangkat pengunjung.
14. Tinjauan manual NLI dan injeksi dilakukan asisten AI pengembang, belum oleh manusia.
15. Dasar lisensi korpus (Pasal 42 huruf b UU 28/2014) baru terverifikasi dari sumber sekunder dan perlu dicek manual.
16. Jalur WebGPU model lokal 1,5B belum diuji di perangkat sungguhan.
17. Korpus hanya 15 peraturan dan sebagian teksnya hasil OCR.

## 9. Yang perlu diputuskan pemilik proyek

1. Menilai apakah hasil tersegel (jawaban benar 51%) cukup untuk demo portofolio, lalu menyetujui atau menolak aktivasi Production (gabung PR #2 ke `main`, pastikan binding `AI` untuk Production).
2. Menerima atau menolak penyimpangan non-inti React/Vite + TS.
3. Memeriksa dasar lisensi korpus.
