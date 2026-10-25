# Kartu metode

Apa yang sebenarnya dilakukan sistem, dan apa yang tidak.

## Ringkasan jujur

Sistem punya dua jenis jawaban, dan situs selalu menyebut mana yang dipakai:

- **Generatif (mode utama, pilihan pengunjung).** Model bahasa menulis jawaban singkat dari empat pasal teratas hasil BM25 + reranker. Mode utama memakai Llama 3.3 70B Instruct (FP8) di Cloudflare Workers AI (paket gratis); mode opsional memakai Qwen2.5 kecil di perangkat pengunjung. Setiap kalimat harus menunjuk pasal sumbernya; kalimat tanpa sitasi sah dibuang.
- **Kutipan langsung (bawaan dan cadangan).** Tidak generatif: ayat atau butir dari pasal peringkat 1 BM25 disalin persis. Dipakai bila mode generatif tidak dipilih, kuota habis, model gagal, atau tidak ada kalimat bersumber yang tersisa.

Tidak ada API berbayar.

## Alur

1. **Ingestion.** PDF resmi diekstraksi per halaman, dipecah per pasal (`src/evidence/ingest.py`, `corpus.py`). Bab dan judul bab dicatat.
2. **Normalisasi.** Huruf kecil, pemecahan kata, stemmer ringan bahasa Indonesia, dan penyamaan ejaan lama hanya untuk pencocokan (`text.py`).
3. **Chunking kontekstual.** Satu pasal satu chunk. Judul dokumen dan bab ditambahkan di depan teks hanya untuk pengindeksan, tidak untuk tampilan atau kutipan.
4. **Retrieval.** BM25 Okapi (idf gaya Lucene, k1 = 1,2, b = 0,75) di `bm25.py`. Ditulis ulang di JavaScript (`web/public/js/retrieval.js`) agar berjalan di peramban.
5. **Gerbang penolakan.** Bila skor BM25 pasal teratas lebih kecil dari ambang 14,0, sistem menolak menjawab dan hanya menunjukkan pasal terdekat. Ambang dipilih dari data dev dengan skor seimbang antara pertanyaan terjawab dan tak terjawab. Bentuk gerbang ini sendiri dipilih setelah run pertama (lihat `docs/evaluasi.md`). Skor BM25 mentah naik dengan panjang pertanyaan, sehingga gerbang lebih mudah menolak pertanyaan pendek.
6. **Ekstraksi jawaban.** Dari pasal peringkat 1, ayat atau butir diberi skor menurut bobot idf istilah pertanyaan yang dicakupnya. Paling banyak tiga unit, dengan syarat skor minimal 60% dari yang terbaik, ditampilkan menurut urutan di pasal (`answer.py`, `answer.js`). Dua angka ini juga ditetapkan setelah run pertama.

7. **Mode generatif.** Dua puluh pasal teratas BM25 dinilai ulang oleh reranker cross-encoder mmarco-mMiniLMv2-L12-H384-v1 (fp32, di peramban, sama dengan evaluasi). Empat pasal teratas masuk ke prompt "bertahan": aturan menjawab hanya dari kutipan, teks pasal dan pertanyaan dibungkus sebagai data, dan jawaban "TIDAK DITEMUKAN" bila tidak ada dasar. Mode server mengirim pertanyaan dan nomor pasal ke `/api/jawab`; fungsi itu menyusun prompt sendiri dari korpus situs dan memanggil Workers AI dengan suhu 0. Jawaban lalu diperiksa di peramban (`periksa` di `prompt.js`): nomor sitasi harus menunjuk pasal yang diberikan, kalimat tanpa sitasi sah dan tautan yang tidak ada di kutipan dibuang.

## Pilihan pencarian untuk mode generatif

LSA, e5 (small, base, large), hibrida BM25 + e5, dan reranker bge-reranker-v2-m3 serta mMiniLM dievaluasi offline. BM25 + reranker mMiniLM memberi MRR@10 uji 0,951 (BM25 saja 0,786), dan menambah e5 sebelum reranker tidak menaikkan angka itu. mMiniLM juga cukup kecil untuk dijalankan di peramban (sekitar 510 MB fp32, diunduh sekali). Aturan pemilihan ini ditetapkan setelah angka semua cara terlihat. Versi 8-bit ditolak karena skornya bergantung pada CPU.

Mode kutipan langsung tetap memakai BM25 saja, agar mode bawaan tidak perlu unduhan model.

## Paritas Python dan JavaScript

Rumus yang sama ditulis dua kali (Python untuk evaluasi, JavaScript untuk situs). Kesamaannya diuji: 221 pertanyaan dijalankan di keduanya pada data nyata dan urutan peringkat, skor, keputusan menolak, serta kalimat kutipan harus sama (`tests/fixtures/parity.json`, `web/tests/real-parity.test.mjs`). Prompt, pembacaan sitasi, dan pemeriksaan jawaban generatif hanya ditulis sekali (`web/public/js/gen/prompt.js`) dan dipakai oleh situs, fungsi server, dan evaluasi. Skor reranker di peramban dibandingkan dengan skor evaluasi PyTorch di Node dan di Chromium (workflow "Peramban generatif").

## Mengapa "halusinasi" diukur seperti ini

Pada mode kutipan langsung, kalimat karangan tidak mungkin ada, jadi risikonya adalah mengutip pasal yang salah (23 dari 81 jawaban uji) dan menjawab tanpa dasar (0 dari 21 pada data uji, 7 dari 12 pada uji tekanan).

Pada mode generatif, model bisa menulis kalimat yang tidak didukung pasal walau bersitasi. Ini diukur dengan penilai NLI multibahasa (mDeBERTa xnli): 108 dari 123 kalimat jawaban uji Llama 3.3 70B didukung pasal yang dikutipnya. Penilai otomatis bisa keliru, terutama untuk angka; dari 14 kalimat "tidak didukung" yang diperiksa manual pada eksperimen sebelumnya, sekitar 9 memang keliru dan sekitar 3 sebenarnya benar. Lihat `docs/evaluasi.md`.

## Strategi inferensi dan hosting

Situs statis di Cloudflare Pages ditambah satu Pages Function. Korpus (±0,47 MB) dan indeks (±0,22 MB) diunduh sekali, pencarian dihitung di peramban, dan mode bawaan tidak mengirim pertanyaan ke mana pun.

Mode generatif utama memanggil Workers AI lewat binding `AI` pada paket Workers Free ($0). Kuota gratis harian (10.000 neuron) cukup untuk puluhan jawaban Llama 3.3 70B per hari untuk semua pengunjung; bila habis, fungsi mengembalikan `kuota_habis` dan situs memakai kutipan langsung sampai 07.00 WIB. Tidak ada server yang tidur. Reranker dan model lokal diunduh dari Hugging Face hanya bila pengunjung memilih mode generatif.

## Penggunaan yang tidak sesuai

- Keputusan hukum, sanksi, atau hasil audit tanpa membaca pasal sumber dan memeriksa versi terbaru peraturan.
- Pertanyaan yang jawabannya tersebar di banyak pasal atau peraturan: kutipan langsung hanya memakai satu pasal, dan mode generatif hanya empat pasal teratas.
- Menganggap jawaban generatif benar karena bersitasi: kalimatnya ditulis model dan tetap harus dicocokkan dengan pasal yang dikutip.
