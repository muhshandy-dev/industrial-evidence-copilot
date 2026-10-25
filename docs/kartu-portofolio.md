# Kartu portofolio

**Industrial Evidence Copilot.** RAG generatif bersitasi atas 15 peraturan K3 Indonesia. Pencarian BM25 dan reranker cross-encoder di peramban, jawaban ditulis Llama 3.3 70B di Cloudflare Workers AI (paket gratis), setiap kalimat wajib menunjuk pasal sumbernya. Kutipan langsung dari pasal tetap menjadi mode bawaan dan cadangan.

- Yang ditunjukkan: ingestion PDF resmi dengan SHA-256, chunking per pasal, BM25 dengan stemmer Indonesia, perbandingan e5 dan dua reranker, reranker di peramban dengan paritas terhadap evaluasi, prompt yang tahan injeksi dan pemeriksaan sitasi setelah generasi, pemilihan model dari data dev dengan aturan tertulis sebelum eksperimen, groundedness dengan penilai NLI, set uji tersegel, endpoint server yang dilindungi (Origin, batas laju, OIDC untuk evaluasi, tanpa secret).
- Angka (data uji, optimistis): mode generatif menjawab benar 72 dari 96 (kutipan langsung 56), 88% kalimat didukung pasal yang dikutip, 0 dari 21 pertanyaan tanpa dasar dan 0 dari 12 pertanyaan uji tekanan dijawab, pasal tepat di peringkat 1 pada 93% pertanyaan.
- Kejujuran: pertanyaan ditulis asisten AI, data uji semi-holdout, beberapa pilihan dibuat setelah angka terlihat, model lokal tidak lolos batas mutu, kuota gratis hanya cukup untuk puluhan jawaban server per hari. Semua tercatat di `docs/evaluasi.md`.
- Stack: Python (numpy, pdfplumber, sentence-transformers, transformers), JavaScript modul tanpa kerangka kerja, transformers.js, Cloudflare Pages Functions dan Workers AI, Playwright dan axe, GitHub Actions.
