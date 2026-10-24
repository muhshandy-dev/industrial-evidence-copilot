# Kartu portofolio

**Industrial Evidence Copilot.** Tanya jawab bersitasi atas 15 peraturan K3 Indonesia. Jawaban ekstraktif (kutipan pasal, bukan teks buatan model), pencarian BM25 di peramban, situs statis tanpa server.

- Yang ditunjukkan: ingestion PDF resmi dengan SHA-256, chunking per pasal, BM25 dengan stemmer Indonesia, gerbang penolakan, evaluasi pencarian dan jawaban dengan interval kepercayaan, paritas Python dan JavaScript, audit independen atas desain evaluasi.
- Angka (data uji, optimistis): pasal tepat di peringkat 1 68%, di lima teratas 90%; 28% jawaban mengutip pasal yang salah; 0 dari 21 pertanyaan tanpa dasar dijawab, tetapi 7 dari 12 pertanyaan panjang di luar korpus tetap dijawab.
- Kejujuran: pertanyaan ditulis asisten AI, data uji semi-holdout, embedding pra-latih belum diuji. Semua tercatat di `docs/evaluasi.md`.
- Stack: Python (numpy, pdfplumber), JavaScript modul tanpa kerangka kerja, Playwright dan axe, GitHub Actions, Cloudflare Pages.
