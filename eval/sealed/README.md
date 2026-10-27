# Set uji tersegel

**Penulis:** agen AI terpisah (Claude) yang ditugasi hanya menulis pertanyaan dan label emas. Agen ini tidak melihat keluaran sistem apa pun (pencarian, jawaban, hasil evaluasi). Ia juga tidak membaca set pertanyaan lama, dokumentasi, kode web, atau riwayat git. Bahan yang dibaca hanya `corpus/korpus.json` dan `corpus/manifest.json`. Kode `src/evidence/evalset.py` dan `src/evidence/corpus.py` dipakai untuk validasi saja.

**Tanggal:** 24 Oktober 2026

## Berkas

- `questions.jsonl` berisi 100 pertanyaan dengan kunci `id, tanya, gaya, gold, gold_alt, kunci, jenis, catatan, split` (`split` selalu `sealed`).
- `injeksi.jsonl` berisi 20 pertanyaan uji *prompt injection* dengan kunci `id, tanya, serangan, perilaku_aman`.

## Komposisi

- **70 pertanyaan terjawab:** 45 bergaya `parafrase` (bahasa awam) dan 25 bergaya `leksikal`. Pertanyaan tersebar ke 15 peraturan, kira-kira sebanding jumlah pasalnya:

  | Peraturan | Pertanyaan |
  |---|---|
  | Permenaker 8/2020 | 20 |
  | Permenaker 37/2016 | 9 |
  | Permenaker 2/1983 | 8 |
  | Permenaker 2/1982 | 4 |
  | Permenaker 26/2014 | 4 |
  | UU 1/1970 | 3 |
  | PP 50/2012 | 3 |
  | Permenaker 4/2025 | 3 |
  | Permenaker 11/2023 | 3 |
  | Kepmenaker 187/1999 | 3 |
  | Permenaker 8/2010 | 2 |
  | Permenaker 13/2025 | 2 |
  | Permenaker 3/1998 | 2 |
  | Permenaker 15/2008 | 2 |
  | Permenaker 3/1982 | 2 |

  Jenisnya terdiri atas angka (batas waktu, umur, masa berlaku, ambang), kewajiban, prosedur, definisi, dan sanksi. Panjang pertanyaan bervariasi dari pendek (≤6 kata) sampai panjang (≥15 kata).
- **30 pertanyaan tak terjawab** (`gold: []`, `kunci: []`):
  - **22 bergaya `dekat`**, bernuansa K3. Isinya:
    - topik peraturan yang dikecualikan dari korpus: lingkungan kerja, ketinggian, elevator/eskalator, pesawat tenaga dan produksi, Dewan K3, dan listrik;
    - BPJS, iuran, dan santunan;
    - premis salah, yaitu angka yang berbeda dari pasal tetapi ditanyakan seolah-olah benar;
    - peraturan yang tidak ada di korpus;
    - waktu kerja/lembur.

    Dua belas di antaranya panjang dan berkosakata regulasi.
  - **8 bergaya `luar`**, di luar topik K3.

## Cara label ditetapkan

1. Penulis membaca seluruh pasal korpus per dokumen, lalu menulis pertanyaan tanpa menyalin kalimat pasal (kecuali gaya `leksikal`).
2. `gold` adalah pasal yang paling langsung menjawab. `gold_alt` adalah pasal lain yang juga menjawab secara sah, misalnya angka yang sama di pasal lain atau rujukan ulang sanksi UU 1/1970. Keduanya ditetapkan **sebelum** ada keluaran sistem, dengan bantuan grep atas korpus. Alasan setiap `gold_alt` dan setiap pasal yang sengaja tidak dijadikan alt dicatat di `catatan`.
3. `kunci` berisi 1–3 butir fakta (angka, satuan, lembaga, istilah) yang ditulis persis seperti di pasal. Setiap butir harus muncul di teks cocok (`Corpus.match_text`) pasal gold. Tidak ada butir yang seluruh tokennya sudah ada di pertanyaan.
4. Untuk pertanyaan tak terjawab, ketiadaan jawaban diverifikasi dengan grep atas teks korpus (istilah yang dicari dicatat di `catatan`). Premis salah dilabeli tak terjawab karena perilaku yang diharapkan adalah mengoreksi premis, bukan membenarkannya.
5. Validasi otomatis memakai `evidence.evalset.key_hit`, `key_tokens`, dan `evidence.corpus.Corpus.read`. Yang diperiksa: semua id ada di korpus, kunci ada di pasal gold, tidak ada kunci yang tokennya seluruhnya ada di pertanyaan, dan tidak ada pertanyaan ganda. Hasilnya bersih (0 masalah).

## Aturan pakai

Set ini harus dijalankan **SEKALI saja**, setelah desain sistem final dibekukan. Jangan mengubah label setelah melihat hasilnya, dan jangan menyetel sistem berdasarkan pertanyaan di sini. Jika set ini sudah dijalankan, hasilnya dilaporkan apa adanya, dan set baru diperlukan untuk evaluasi tersegel berikutnya.
