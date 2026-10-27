# Kartu Portofolio: Industrial Evidence Copilot

Teks siap pakai untuk kartu proyek di portofolio Magic UI. Semua angka berasal dari `eval/holdout-v2/hasil.json`, `eval/sealed/hasil.json`, dan `eval/results.json`.

## Isi kartu

- **Judul:** Industrial Evidence Copilot
- **Kategori:** Generative AI dan RAG, tanya jawab regulasi K3
- **Tagline:** Tanya jawab peraturan K3 Indonesia dengan setiap jawaban menunjuk pasal sumbernya.
- **Deskripsi singkat (2 kalimat):** Pipeline RAG atas 15 peraturan K3 resmi (622 pasal): BM25 berbahasa Indonesia, reranker cross-encoder di peramban, dan Llama 3.3 70B di Cloudflare Workers AI yang wajib mencantumkan sitasi per kalimat, dinilai dengan set tersegel dan holdout yang dijalankan sekali. Mode generatif gagal satu kriteria akhir (sitasi 88,6% dari syarat 90%), jadi situs publik memakai kutipan langsung yang dapat diperiksa dan mode generatif tetap sebagai prototipe riset.
- **Angka utama:**
  - Holdout v2 (120 pertanyaan baru, sekali jalan): generatif benar 70,0% (63 dari 90), kutipan langsung 53,3%, 0 dari 30 pertanyaan tanpa dasar dijawab keliru
  - Sitasi semua tepat 88,6%, di bawah syarat 90%: keputusan FAIL, dilaporkan apa adanya
  - BM25 + reranker: pasal tepat di peringkat 1 pada 89 sampai 93% pertanyaan
- **Teknologi:** Python (pdfplumber, numpy, sentence-transformers, transformers), JavaScript modul tanpa framework, transformers.js, Cloudflare Pages Functions, Workers AI, Playwright, axe-core, GitHub Actions
- **Tautan demo:** https://industrial-evidence-copilot.pages.dev/ (kutipan langsung)
- **Tautan kode:** https://github.com/muhshandy-dev/industrial-evidence-copilot
- **Label status:** RAG Research Prototype

## Peran saya

Saya menetapkan tujuan, batasan biaya nol, dan standar kejujuran evaluasi; membuat repo, proyek Cloudflare Pages, dan binding Workers AI; mengarahkan pengembangan yang dikerjakan bersama asisten AI (Claude Code); menyetujui setiap set uji sekali jalan; dan memutuskan menutup proyek sebagai prototipe riset ketika mode generatif gagal satu kriteria. Kode, eksperimen, dan pengujian ditulis dengan bantuan asisten AI di bawah arahan dan review saya.

## Catatan kejujuran untuk kartu

- Jangan sebut situs publik "chatbot AI generatif". Yang benar: situs publik mengutip pasal; mode generatif adalah prototipe riset yang dievaluasi tetapi tidak diaktifkan.
- Sebut bahwa pertanyaan evaluasi ditulis asisten AI, bukan praktisi K3.
- Sebut bahwa angka data uji (75% benar) optimistis; angka yang dipakai untuk keputusan adalah holdout v2.
- Bukan nasihat hukum.
