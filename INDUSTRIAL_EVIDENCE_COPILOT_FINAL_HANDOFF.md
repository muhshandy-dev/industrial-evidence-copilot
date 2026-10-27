# Industrial Evidence Copilot: laporan serah terima akhir

**Status akhir: RAG Research Prototype.** Tahap eksperimen ditutup oleh pemilik proyek pada 27 Oktober 2026 setelah holdout v2 gagal satu kriteria. Disusun oleh asisten AI pengembang (Claude) pada 25 Oktober 2026, diperbarui terakhir 27 Oktober 2026.

- Repositori: `muhshandy-dev/industrial-evidence-copilot`. Cabang pengembangan `claude/project-thread-8fnhl3`, digabung ke `main` lewat PR #2.
- Production (https://industrial-evidence-copilot.pages.dev/): hanya **kutipan langsung** (tidak generatif). Mode generatif tidak aktif di domain ini: panel tidak menawarkannya dan `/api/jawab` menolak pengunjung (503) tanpa memanggil model.
- Deploy riset (Preview cabang, https://claude-project-thread-8fnhl3.industrial-evidence-copilot.pages.dev/): mode generatif dapat dipilih dan berlabel "prototipe riset".
- Biaya: $0 (Cloudflare Pages dan Workers AI paket Workers Free; kuota habis menghasilkan galat, bukan tagihan).
- Semua angka di bawah berasal dari berkas yang di-commit (`eval/results.json`, `eval/sealed/hasil.json`, `eval/holdout-v2/hasil.json`, `eval/analisis/`, `eval/*-tinjauan.json`). Bila laporan ini berbeda dari berkas itu, berkasnya yang benar.

## 1. Ringkasan

Proyek ini membangun RAG generatif bersitasi atas 15 peraturan K3 Indonesia (622 pasal) sesuai kompetensi inti AI01 di spesifikasi Master MagangHub: dense retrieval (e5 dengan FAISS), hybrid search, reranker, generasi jawaban oleh LLM open-weight, sitasi per kalimat yang diperiksa, pengukuran groundedness dengan NLI, pertahanan prompt injection, set uji tersegel, dan holdout sekali jalan.

Komponen generatif sudah diimplementasikan dan dievaluasi lengkap. Pada evaluasi akhir (holdout v2, 120 pertanyaan baru, sekali jalan) alur v2 menjawab benar 63 dari 90 (70,0%), lebih baik dari kutipan langsung (48 dari 90), dan tidak menjawab keliru satu pun dari 30 pertanyaan tanpa dasar. Satu kriteria gagal: jawaban yang semua sitasinya tepat 62 dari 70 (88,6%), di bawah syarat 90%. **Keputusan: FAIL.**

Pemilik proyek menerima hasil itu tanpa mengubah standar kelulusan, lalu memutuskan:

1. tidak ada holdout baru dan tidak ada penyetelan memakai holdout v2;
2. kutipan langsung tetap fitur utama Production;
3. mode generatif dipertahankan sebagai prototipe riset, tidak diaktifkan sebagai jawaban publik;
4. proyek ditutup dengan status RAG Research Prototype.

## 2. Riwayat eksperimen

Urutan lengkap, termasuk kegagalan. Setiap set uji sekali jalan hanya dipakai sekali.

| Tahap | Tanggal | Apa yang dilakukan | Hasil utama | Dokumen |
| --- | --- | --- | --- | --- |
| Versi 1 | 24 Okt | BM25 dengan stemmer, gerbang skor, kutipan langsung | dideploy ke Production (PR #1) | `docs/evaluasi.md` |
| Pencarian v2 | 24 sampai 25 Okt | 21 sistem pencarian dibandingkan (BM25, e5 tiga ukuran dengan FAISS, hibrida, dua reranker) | BM25 + reranker mMiniLM: MRR@10 uji 0,951 | `eval/results.json` |
| Pemilihan model | 25 Okt | aturan pemilihan ditulis sebelum eksperimen; 3 model server x 2 prompt di dev | Llama 3.3 70B, prompt `bertahan` | `docs/eksperimen-prompt.md` |
| Data uji, uji tekanan, injeksi | 25 Okt | evaluasi model terpilih | uji benar 72 dari 96 (optimistis) | `eval/results.json` |
| Set tersegel | 26 Okt | 100 pertanyaan penulis terpisah, sekali jalan | benar 36 dari 70 (51%), turun jauh dari uji | `eval/sealed/hasil.json` |
| Analisis akar masalah | 27 Okt | tanpa inferensi baru, hanya data yang ada | penilai kunci terlalu kaku dan gerbang BM25 menolak parafrase | `ROOT_CAUSE_ANALYSIS.md` |
| Penilaian v2 dan kriteria | 27 Okt | aturan penilaian dan kriteria lolos dibekukan sebelum holdout ditulis | 5 kriteria | `docs/penilaian-v2.md` |
| Alur v2 di dev | 27 Okt | gerbang BM25 atau reranker, ringkasan ayat, kutipan cadangan berurutan reranker | dev benar 56 dari 65 (v1: 43); sitasi 89% | `docs/alur-v2.md` |
| Holdout v2 | 27 Okt | 120 pertanyaan baru, sekali jalan, konfigurasi beku | **FAIL** pada sitasi (88,6%) | `docs/holdout-v2-hasil.md` |
| Penutupan | 27 Okt | mode generatif dimatikan di domain produksi, dokumentasi akhir | status RAG Research Prototype | dokumen ini |

## 3. Hasil evaluasi

### 3.1 Evaluasi akhir: holdout v2 (dasar keputusan)

Run GitHub Actions 40483481061 (workflow `holdout-v2.yml`), commit yang dievaluasi `ef7df3d` (konfigurasi beku `1ea6e9c` ditambah izin workflow), commit hasil `2581e6e`. 120 pertanyaan (90 terjawab, 30 tanpa dasar), hash dikunci sebelum run. Alur v1, alur v2, dan kutipan langsung dinilai pada pertanyaan yang sama dengan penilaian v2.

| Kriteria (alur v2) | Syarat | Hasil | Status |
| --- | --- | --- | --- |
| Jawaban generatif benar | ≥ 70% | 63 dari 90 (70,0%) | lolos, tepat di ambang |
| Lebih baik dari kutipan langsung | lebih tinggi | 63 lawan 48 | lolos |
| Pertanyaan tanpa dasar dijawab keliru | ≤ 10% | 0 dari 30 | lolos |
| Jawaban yang semua sitasinya tepat | ≥ 90% | 62 dari 70 (88,6%) | **gagal** |
| Kalimat tanpa sitasi yang ditampilkan | 0 | 0 | lolos |

| Ukuran | Alur v1 | Alur v2 | Kutipan langsung |
| --- | --- | --- | --- |
| Benar, dari 90 terjawab | 56 (62,2%) | 63 (70,0%) | 48 (53,3%) |
| Dijawab, dari 90 terjawab | 65 | 70 | 75 |
| Benar di antara yang dijawab | 56 dari 65 | 63 dari 70 | 48 dari 75 |
| Tanpa dasar: ditolak, koreksi premis sah, keliru | 28, 2, 0 dari 30 | 28, 2, 0 dari 30 | 10 dari 30 dijawab |
| Sitasi: minimal satu sah | 62 dari 65 | 67 dari 70 | tidak berlaku |
| Sitasi: semua sah | 56 dari 65 | 62 dari 70 | tidak berlaku |
| Kalimat didukung NLI | 75 dari 100 | 76 dari 100 | tidak berlaku |

Analisis sensitivitas yang ditetapkan sebelum run (tanpa h023, h066, h072 yang teksnya kebetulan identik dengan set lain, 117 pertanyaan): alur v2 benar 62 dari 89 (69,7%), sitasi semua sah 61 dari 69 (88,4%); alur v1 benar 55 dari 89. Kesimpulan tidak berubah.

Penyebab kegagalan: delapan jawaban (h031, h046, h078, h095, h101, h104, h117, h119) memuat kalimat tambahan yang mengutip pasal terkait di luar label. Lima di antaranya tetap dinilai benar. Pola ini sudah terlihat di dev (55 dari 62, 89%) dan dicatat sebagai risiko sebelum run.

### 3.2 Set tersegel (alur v1, penilaian v1)

Run 40357743888, 26 Oktober 2026, commit dievaluasi `4c5c4de`, commit hasil `058093d`.

| Ukuran | Llama 3.3 70B | Kutipan langsung | Qwen2.5 0,5B CPU | Qwen2.5 1,5B GPU |
| --- | --- | --- | --- | --- |
| Jawaban benar | 36/70 (51%) [40; 63] | 30/70 (43%) | 25/70 | 14/70 |
| Menolak padahal ada jawabannya | 20/70 | 17/70 | 19/70 | 49/70 |
| Pertanyaan tanpa dasar yang dijawab | 2/30 | 12/30 | 11/30 | 1/30 |
| Kalimat didukung NLI | 56/68 (82%) | tidak dinilai | 6/20 | tidak ada |
| Jawaban yang semua sitasinya tepat | 46/50 (92%) | | 6/13 | |

Analisis akar masalah (`ROOT_CAUSE_ANALYSIS.md`): bila pasal emas sampai ke model, Llama menjawab benar 48 dari 50. Sekitar 16 dari 24 poin selisih uji ke tersegel berasal dari penilai kunci yang kaku; kegagalan sistem terbesar adalah gerbang BM25 yang menolak 17 pertanyaan parafrase. Dua "tanpa dasar yang dijawab" adalah koreksi premis yang benar. Angka resmi tetap 51%.

### 3.3 Data uji, uji tekanan, injeksi (alur v1, optimistis)

| Ukuran | Llama 3.3 70B | Qwen2.5 1,5B GPU | Qwen2.5 0,5B CPU | Kutipan langsung |
| --- | --- | --- | --- | --- |
| Jawaban benar | 72/96 (75%) [65; 83] | 31/96 | 40/96 | 56/96 (58%) |
| Pertanyaan tanpa dasar yang dijawab | 0/21 | 0/21 | 0/21 | 0/21 |
| Kalimat didukung NLI | 108/123 (88%) | 3/4 | 4/19 | tidak dinilai |
| Jawaban yang semua sitasinya tepat | 65/79 | 3/4 | 4/12 | |

- Uji tekanan (12 pertanyaan di luar korpus): Llama menjawab 0, kutipan langsung 7.
- Prompt injection (20 pertanyaan): 11 sampai ke model, 11 dari 11 jawaban tampil aman; keluaran mentah menuruti perintah tersembunyi 1 dari 11 dengan prompt `bertahan` dan 2 dari 11 dengan prompt polos. Kalimat seperti itu selalu dibuang pemeriksaan sitasi.
- Validasi manual NLI (`eval/nli-tinjauan.json`): 25 dari 25 sampel "didukung" memang didukung; dari 15 "tidak didukung", hanya 1 yang memang tidak didukung.

### 3.4 Pencarian (data uji, 96 pertanyaan)

| Metode | Peringkat 1 | MRR@10 |
| --- | --- | --- |
| BM25 + stem + konteks (kutipan langsung) | 0,677 | 0,786 |
| Dense multilingual-e5-large (FAISS) | 0,802 | 0,861 |
| Hibrida BM25 + e5-large (RRF) | 0,812 | 0,864 |
| BM25 + reranker mMiniLM (mode generatif) | 0,927 | 0,951 |
| BM25 + reranker bge-reranker-v2-m3 | 0,865 | 0,911 |

Pada set tersegel, reranker mMiniLM tetap tinggi: peringkat 1 0,886, MRR@10 0,909.

## 4. Konfigurasi beku (mode generatif)

| Komponen | Nilai |
| --- | --- |
| Model server | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Llama 3.3 Community License) di Workers AI |
| Prompt | varian `bertahan` di `web/public/js/gen/prompt.js` |
| Dekode | suhu 0, seed 42, paling banyak 220 token |
| Konteks | 4 pasal teratas, pasal di atas 1.800 karakter diringkas menjadi ayat relevan (alur v2) |
| Gerbang | skor BM25 ≥ 14,0 atau skor reranker pasal peringkat 1 ≥ 1,0 (alur v2) |
| Reranker | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1`, revisi `1427fd65`, fp32, di peramban |
| Penilai groundedness (evaluasi saja) | mDeBERTa-v3-base-xnli-multilingual-nli-2mil7, ambang 0,5 |
| Model lokal | Qwen2.5 1,5B (WebGPU) dan 0,5B (CPU), revisi `d54957e3` dan `22942cb7` |

## 5. Status fitur

| Fitur | Production | Preview riset | Bukti |
| --- | --- | --- | --- |
| Kutipan langsung | aktif, satu-satunya mode | aktif, bawaan | e2e lokal dan CI |
| Generatif dengan model server | tidak aktif (panel hanya kutipan, `/api/jawab` 503 untuk pengunjung) | dapat dipilih, berlabel "prototipe riset" | `web/public/js/situs.js`, `web/tests/fungsi.test.mjs`, `web/tests/e2e.mjs` |
| Generatif dengan model lokal | tidak aktif | dapat dipilih; jalur CPU teruji di Chromium runner, WebGPU belum diuji di perangkat sungguhan | `web/tests/gen-browser.mjs` |
| Label status "RAG Research Prototype" | di kepala halaman | sama | `web/public/index.html` |
| Halaman Evaluasi dengan hasil holdout v2 (kriteria, perbandingan, sensitivitas, "TIDAK LOLOS") | ada | ada | `web/public/js/evaluation.js`, e2e |
| Kembali ke kutipan saat kuota habis | tidak relevan | teruji (run 40188600616) | |

## 6. Pengujian dan keamanan

| Uji | Hasil |
| --- | --- |
| pytest (termasuk uji hasil tersegel dan holdout v2) | 63 lolos |
| ruff check dan format | lolos |
| npm test (paritas BM25 JS dan Python 221 pertanyaan, fungsi `/api/jawab` termasuk OIDC, Origin, batas laju, domain produksi) | 23 lolos |
| Pemeriksaan build (`check-build`) | lolos |
| e2e Playwright: ruang kerja, penolakan, domain produksi hanya kutipan, halaman evaluasi termasuk holdout v2, metode, tanpa em dash | lolos |
| Aksesibilitas axe, tata letak desktop dan ponsel, tema terang dan gelap, gerak dikurangi, papan ketik | lolos, tanpa pelanggaran axe |
| Paritas reranker Node dan Chromium terhadap PyTorch | selisih maksimum 0,00001 (run 40184983713, 40187699580) |
| Keamanan `/api/jawab` di Preview sungguhan (tanpa Origin 403, pilihan model tanpa token 403, token palsu 401) | lolos (run 40187699580, 40188600616) |

Pemeriksaan keamanan akhir (`docs/keamanan.md`): `npm audit` 0 kerentanan, `pip-audit` tanpa kerentanan yang diketahui, tidak ada secret di repositori, CSP `default-src 'none'` dan header keamanan lain (`'wasm-unsafe-eval'` hanya untuk WebAssembly model di peramban), endpoint dibatasi, kode pihak ketiga dipatok dengan sidik SHA-256.

## 7. Bukti deploy

- Preview riset: diakses dari GitHub Actions karena lingkungan pengembangan tidak dapat membuka `pages.dev`. `GET /api/jawab` melaporkan model Llama 3.3 70B aktif sebelum setiap evaluasi.
- Run evaluasi: dev alur v1 40185937227 dan 40186283294; test, uji tekanan, injeksi 40187703106; tersegel 40357743888; holdout v2 40483481061 (percobaan teknis gagal 40482477581, tanpa keluaran).
- Production: diverifikasi setelah PR #2 digabung dengan workflow "Periksa situs terbit" (`tools/verify_published.py`). Pemeriksa itu mencocokkan data situs dengan repositori, memeriksa header keamanan dan label status, dan di domain produksi mewajibkan `GET /api/jawab` melaporkan `aktif: false` serta POST pengunjung ditolak 503. Nomor run dan hasilnya dicatat di bagian 11.

## 8. Perbandingan dengan kriteria penerimaan

Kriteria ditulis 24 Oktober 2026 sebelum coding (`kriteria-penerimaan.md` di folder berkas proyek, bukan di repositori).

| No | Kriteria | Status | Bukti dan catatan |
| --- | --- | --- | --- |
| 1 | Dense retrieval e5 + FAISS dengan metrik dan interval | Terpenuhi | `src/evidence/dense.py`, `eval/results.json` |
| 2 | Hybrid search dan perbandingan berpasangan | Terpenuhi | RRF, `eval/results.json` |
| 3 | Reranker sebagai ablasi, dipasang bila lebih baik | Terpenuhi | mMiniLM +16,4 poin MRR, berjalan di peramban dengan paritas teruji |
| 4 | LLM open-weight menulis jawaban bersitasi dan menolak tanpa dasar | Terpenuhi sebagai prototipe riset | Llama 3.3 70B; dievaluasi di empat set; **tidak diaktifkan** sebagai jawaban publik karena gagal kriteria sitasi holdout v2 |
| 5 | Groundedness per kalimat dengan NLI, divalidasi manual, baseline ekstraktif | Terpenuhi, dengan catatan | validasi manual oleh asisten AI, bukan manusia independen |
| 6 | Pertahanan injection diukur sebelum dan sesudah | Terpenuhi | prompt polos lawan bertahan, tinjauan per butir |
| 7 | Demo jujur: label per jawaban, jatuh ke ekstraktif | Terpenuhi | label mode, label status, fallback kuota teruji |
| 8 | Set uji tersegel sekali jalan | Terpenuhi | tersegel dan holdout v2, masing-masing sekali |
| 9 | Reproduksi di GitHub Actions dengan revisi dipatok | Sebagian | revisi model server Workers AI tidak dapat dipatok |
| Non-inti | Frontend React/Vite + TS | Menyimpang | tetap JavaScript modul tanpa build |
| Non-inti | Eksekusi di Kaggle | Menyimpang (setara) | GitHub Actions |

Kesimpulan: kompetensi inti Generative AI + RAG sudah diimplementasikan dan dievaluasi dengan jujur, tetapi **tidak lolos** standar kelulusan yang ditetapkan untuk dijadikan jawaban publik. Karena itu statusnya RAG Research Prototype, bukan produk generatif.

## 9. Keterbatasan dan pengungkapan

1. Semua pertanyaan evaluasi ditulis asisten AI (dev dan test oleh asisten pengembang; tersegel dan holdout v2 oleh agen terpisah), bukan praktisi K3.
2. Data uji semi-holdout: agregat test terlihat sebelum desain akhir. Aturan pemilihan sistem pencarian generatif ditetapkan setelah angka semua sistem terlihat.
3. Alur v2 disusun setelah kegagalan set tersegel terlihat; perbaikannya disetel di dev saja dan diukur di holdout v2.
4. Satu angka holdout v2 terlihat sebelum run (85 dari 120 lolos gerbang v1) saat menguji kode; tidak dipakai untuk apa pun.
5. Tiga pertanyaan holdout v2 kebetulan identik dengan set lain; dilaporkan lewat analisis sensitivitas yang ditetapkan sebelum run.
6. Percobaan pertama holdout v2 gagal teknis (401, izin workflow) tanpa keluaran; perbaikannya hanya izin workflow.
7. Komponen ringkasan ayat pada holdout v2 hanya didukung NLI 17 dari 27 kalimat, di bawah aturan dev (80%). Ini pengamatan saja; konfigurasi tidak diubah.
8. Workers AI tidak menyediakan patokan revisi bobot, dan suhu 0 tidak menjamin keluaran identik. Keluaran yang dinilai di-commit.
9. Penilai NLI otomatis keliru pada angka dan parafrase; tinjauan manual NLI dan injeksi dilakukan asisten AI, belum manusia.
10. Hasil putaran 2 untuk Qwen3 tidak sah (mode berpikir tidak mati); Gemma 3 12B tidak tersedia dan diganti Mistral Small 3.1 sebelum hasil terlihat.
11. Reranker 8-bit dicoba lalu ditolak karena skornya bergantung CPU.
12. Endpoint evaluasi Preview sempat terbuka tanpa token sekitar satu jam pada 25 Oktober 2026 sebelum kunci OIDC. Tanpa biaya.
13. Kuota harian gratis sempat ditolak lebih lama dari jadwal pemulihan pada 26 Oktober 2026; penyebabnya tidak diketahui.
14. Batas laju 6 per menit per IP berlaku per isolate, bukan global.
15. Mode generatif di Preview memerlukan unduhan reranker sekitar 510 MB sekali.
16. Jalur WebGPU model lokal belum diuji di perangkat sungguhan.
17. Korpus hanya 15 peraturan dan sebagian teksnya hasil OCR. Dasar lisensi (Pasal 42 huruf b UU 28/2014) baru terverifikasi dari sumber sekunder.
18. Bukan nasihat hukum.

## 10. Tindakan manual yang masih diperlukan

1. **Memeriksa dasar lisensi korpus** (Pasal 42 huruf b UU 28/2014) dari sumber primer.
2. **Membuka Production sendiri** di peramban untuk konfirmasi visual: label "RAG Research Prototype", jawaban kutipan langsung, dan panel tanpa pilihan generatif. Lingkungan pengembangan tidak dapat membuka `pages.dev`.
3. **Memutuskan penyimpangan non-inti React/Vite + TS** (diterima atau tidak). Tidak ada perubahan yang direncanakan.
4. Opsional: memutuskan apakah deploy Preview riset tetap boleh memakai kuota Workers AI gratis. Bila tidak, binding `AI` untuk Preview dapat dilepas di dasbor Cloudflare; situs akan otomatis memakai kutipan langsung.
5. Opsional: menguji jalur WebGPU model lokal di perangkat sungguhan bila ingin melengkapi catatan prototipe.

Tidak ada evaluasi tambahan yang direncanakan. Evaluasi generalisasi apa pun di masa depan memerlukan set baru; holdout v2 sudah terpakai.

## 11. Verifikasi Production setelah penggabungan

Diisi setelah PR #2 digabung dan Cloudflare Pages selesai deploy.
