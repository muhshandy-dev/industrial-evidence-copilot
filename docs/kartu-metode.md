# Kartu metode

Apa yang sebenarnya dilakukan sistem, dan apa yang tidak.

## Ringkasan jujur

Sistem ini **bukan** generatif. Tidak ada model bahasa yang menulis jawaban. Jawabannya adalah kalimat (ayat atau butir) yang dipilih dari pasal peringkat 1 hasil pencarian BM25 dan disalin persis. Tidak ada API berbayar dan tidak ada panggilan jaringan saat pengguna bertanya.

## Alur

1. **Ingestion.** PDF resmi diekstraksi per halaman, dipecah per pasal (`src/evidence/ingest.py`, `corpus.py`). Bab dan judul bab dicatat.
2. **Normalisasi.** Huruf kecil, pemecahan kata, stemmer ringan bahasa Indonesia, dan penyamaan ejaan lama hanya untuk pencocokan (`text.py`).
3. **Chunking kontekstual.** Satu pasal satu chunk. Judul dokumen dan bab ditambahkan di depan teks hanya untuk pengindeksan, tidak untuk tampilan atau kutipan.
4. **Retrieval.** BM25 Okapi (idf gaya Lucene, k1 = 1,2, b = 0,75) di `bm25.py`. Ditulis ulang di JavaScript (`web/public/js/retrieval.js`) agar berjalan di peramban.
5. **Gerbang penolakan.** Bila skor BM25 pasal teratas lebih kecil dari ambang 14,0, sistem menolak menjawab dan hanya menunjukkan pasal terdekat. Ambang dipilih dari data dev dengan skor seimbang antara pertanyaan terjawab dan tak terjawab. Bentuk gerbang ini sendiri dipilih setelah run pertama (lihat `docs/evaluasi.md`). Skor BM25 mentah naik dengan panjang pertanyaan, sehingga gerbang lebih mudah menolak pertanyaan pendek.
6. **Ekstraksi jawaban.** Dari pasal peringkat 1, ayat atau butir diberi skor menurut bobot idf istilah pertanyaan yang dicakupnya. Paling banyak tiga unit, dengan syarat skor minimal 60% dari yang terbaik, ditampilkan menurut urutan di pasal (`answer.py`, `answer.js`). Dua angka ini juga ditetapkan setelah run pertama.

## Kenapa embedding padat tidak dipakai

Variasi LSA (vektor dari korpus sendiri) dan hibrida BM25 + LSA dengan RRF diuji offline dan tidak lebih baik daripada BM25 dengan konteks (MRR uji lebih rendah; lihat `docs/evaluasi.md`). Karena itu situs hanya memuat BM25.

**Belum dilakukan:** perbandingan dengan model embedding pra-latih multibahasa (misalnya e5). Unduhan model diblokir dari lingkungan pengembangan sehingga hasilnya tidak ada. Jangan dibaca bahwa BM25 sudah terbukti lebih baik daripada embedding pra-latih; yang terbukti hanya bahwa LSA dari korpus kecil ini tidak membantu.

## Paritas Python dan JavaScript

Rumus yang sama ditulis dua kali (Python untuk evaluasi, JavaScript untuk situs). Kesamaannya diuji: 221 pertanyaan dijalankan di keduanya pada data nyata dan urutan peringkat, skor, keputusan menolak, serta kalimat kutipan harus sama (`tests/fixtures/parity.json`, `web/tests/real-parity.test.mjs`).

## Mengapa "halusinasi" diukur seperti ini

Pada sistem ekstraktif, kalimat karangan tidak mungkin ada. Pemeriksaan otomatis bahwa kalimat jawaban sama dengan teks korpus memang selalu nol karena konstruksi, bukan prestasi. Teks korpus sendiri hasil ekstraksi PDF dan sebagian OCR, jadi bisa memuat salah baca; kutipan tetap perlu dicek ke PDF resmi. Risiko yang nyata ada dua dan keduanya diukur:

1. mengutip pasal yang salah (pada data uji 23 dari 81 jawaban, 28%), dan
2. menjawab pertanyaan yang korpus tidak memuat dasarnya (0 dari 21 pada data uji, tetapi 7 dari 12 pada uji tekanan dengan pertanyaan panjang berkosakata K3).

Angka ini optimistis; lihat `docs/evaluasi.md` untuk protokol dan batasnya.

## Strategi inferensi dan hosting

Situs statis di Cloudflare Pages. Korpus (±0,47 MB) dan indeks (±0,22 MB) diunduh sekali, pencarian dihitung di peramban. Tidak ada server yang tidur, jadi tidak ada jeda mulai dingin. Biayanya nol dan pertanyaan pengguna tidak meninggalkan peramban.

Konsekuensinya, hanya metode yang ringan yang bisa dipasang. Jika kelak ingin memakai model generatif atau embedding, itu menuntut inferensi server atau WebGPU di peramban, dan akan memerlukan keputusan terpisah soal biaya dan kualitas. Itu tidak dikerjakan di sini.

## Penggunaan yang tidak sesuai

- Keputusan hukum, sanksi, atau hasil audit tanpa membaca pasal sumber dan memeriksa versi terbaru peraturan.
- Pertanyaan yang jawabannya tersebar di beberapa pasal atau peraturan: sistem hanya mengutip dari satu pasal.
