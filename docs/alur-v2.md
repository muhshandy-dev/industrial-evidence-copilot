# Alur v2 mode generatif

Alur v2 memperbaiki dua akar masalah terbesar dari `ROOT_CAUSE_ANALYSIS.md`:

- **AM2:** gerbang BM25 menolak pertanyaan berbahasa awam;
- **AM3:** pasal panjang terpotong di prompt.

Model, prompt sistem, jumlah pasal, dan pemeriksaan sitasi tidak berubah.

## 1. Perubahan

| Komponen | Alur v1 (sistem pada set tersegel lama) | Alur v2 |
| --- | --- | --- |
| Gerbang penolakan | Skor BM25 tertinggi ≥ 14,0 | Skor BM25 ≥ 14,0 **atau** skor reranker pasal peringkat 1 ≥ 1,0 |
| Pasal > 1.800 karakter | Dipotong dari awal | Diringkas menjadi ayat atau butir yang paling relevan dengan pertanyaan, urutan asli dipertahankan, bagian yang dilewati ditandai `[…]` |
| Kutipan cadangan | Pasal peringkat 1 BM25 | Pasal peringkat 1 setelah reranker |
| Label situs | "utama" | "eksperimental", kutipan langsung tetap mode utama |

Catatan untuk setiap perubahan:

- **Ambang reranker 1,0** dipilih di dev saja. Aturannya sama dengan ambang BM25: skor seimbang kutipan tertinggi, ambang terkecil bila seri (`src/evidence/akar_masalah.py`).
- **Relevansi ayat** dihitung dengan cakupan istilah pertanyaan berbobot idf, fungsi yang sama dengan kutipan langsung. Urutan pilihnya:
  1. ayat berskor tertinggi;
  2. ayat tepat sebelum ayat terpilih;
  3. ayat pertama.

  Pasal pendek tidak berubah sama sekali. Kode: `ringkasPasal` di `web/public/js/gen/prompt.js`.
- **Biaya inferensi per pertanyaan tidak bertambah.** Reranker sudah berjalan di peramban pada v1. Model bahasa tetap dipanggil paling banyak sekali per pertanyaan, dan prompt tidak lebih panjang. Yang bertambah adalah jumlah pertanyaan yang sampai ke model, karena gerbang lebih longgar.

Kode situs dan evaluasi memakai modul yang sama. Evaluasi dapat meminta alur v1 sebagai pembanding: di `/api/jawab`, hanya jalur evaluasi bertoken OIDC yang boleh memilih alur.

## 2. Aturan keputusan di dev (ditulis sebelum keluaran v2 ada)

**Data.** Data dev saja, dengan penilaian v2 (`docs/penilaian-v2.md`).

**Pembanding.** Keluaran alur v1 yang sudah ada.

**Panggilan.** Model hanya dipanggil untuk pertanyaan yang prompt-nya berbeda dari v1. Ada dua jenisnya:

- pertanyaan yang baru lolos gerbang;
- pertanyaan yang ringkasan ayatnya mengubah isi prompt.

Prompt yang identik memakai ulang keluaran v1. Uji kering mencatat 25 panggilan: 16 karena gerbang dan 9 karena ringkasan ayat.

**Penilaian per komponen.** Setiap komponen dinilai dari pertanyaan yang memang dipengaruhinya. Komponen dipertahankan bila memenuhi semua syarat berikut:

1. Jumlah jawaban benar pada pertanyaan terjawab tidak turun dibanding v1.
2. Pertanyaan tak terjawab yang dijawab keliru bertambah paling banyak 1.
3. Kalimat generatif yang didukung NLI paling sedikit 80% (bila ada 10 kalimat atau lebih).

**Bila gagal.** Komponen yang gagal dikembalikan ke perilaku v1, dan hasilnya dilaporkan. Tidak ada penyetelan ulang ambang atau prompt pada putaran ini.

**Setelah lolos.** Konfigurasi akhir dibekukan, lalu diuji sekali pada holdout v2 (`docs/penilaian-v2.md` bagian 3).

## 3. Hasil dev

Diisi setelah run dev (`eval/analisis/alur-v2-dev.json`).

## 4. Catatan keterbukaan

- **Satu angka holdout sudah terlihat.** Saat menguji kode `evidence holdout input` di lokal, pengembang melihat jumlah pertanyaan holdout v2 yang lolos gerbang alur v1: 85 dari 120. Pada saat itu skor reranker untuk pertanyaan holdout belum dihitung. Isi pertanyaan, label, dan keluaran apa pun tidak terlihat. Angka itu tidak dipakai untuk memilih atau menyetel apa pun.
- **Validasi penulis.** Validasi set oleh penulis hanya melaporkan hitungan komposisi dan hasil pemeriksaan otomatis.
