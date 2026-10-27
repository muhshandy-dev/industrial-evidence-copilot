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

Run dev dijalankan pada 27 Oktober 2026 dengan workflow Eksperimen model server, alur v2. Run itu memakai 25 panggilan model; 44 keluaran disalin dari v1 karena prompt-nya identik. Rinciannya ada di `eval/analisis/alur-v2-dev.json`. Semua angka di bawah memakai penilaian v2. Di dev, penilaian v1 dan v2 memberi angka yang sama.

| Ukuran (dev) | Alur v1 | Alur v2 |
| --- | --- | --- |
| Jawaban benar, 65 pertanyaan terjawab | 43 (66%) | **56 (86%)** |
| Kutipan langsung bawaan pada set yang sama | 42 (65%) | 42 (65%) |
| Tak terjawab yang dijawab keliru, dari 39 | 0 | 0 |
| Ditolak gerbang | 51 | 35 |
| Semua sitasi sah (jawaban generatif atas pertanyaan terjawab) | 41/48 (85%) | 55/62 (89%) |
| Kalimat didukung NLI | 66/78 (85%) | 84/95 (88%) |
| Kalimat tanpa sitasi yang ditampilkan | 0 | 0 |

Hasil per komponen, menurut aturan bagian 2:

- **Gerbang: lolos aturan.** 16 pertanyaan baru lolos gerbang. Dari 14 pertanyaan terjawab, 13 kini benar (sebelumnya 0). Dua pertanyaan tak terjawab yang ikut lolos tetap ditolak model, dan kalimatnya didukung NLI 17/17.
- **Ringkasan ayat: lolos aturan, tetapi netral di dev.** Ada 9 prompt yang berubah. Ketujuh pertanyaan terjawab tetap benar, kedua pertanyaan tak terjawab tetap ditolak, dan kalimatnya didukung NLI 10/11. Dev tidak punya kasus pasal terpotong, jadi manfaat komponen ini belum terukur di dev. Kasus terpotong hanya terlihat di test (q127) dan di set tersegel lama.
- **Kutipan cadangan berurutan reranker: lolos aturan karena tidak ada kasus.** Tidak ada pertanyaan dev yang berakhir di kutipan cadangan, jadi komponen ini belum teruji pada keluaran model.

Ketiga komponen dipertahankan, dan konfigurasi alur v2 dibekukan pada commit ini.

Batasan:

- **Angka dev optimistis.** Ambang reranker 1,0 dipilih di dev, dan dev sudah dipakai berkali-kali.
- **Sitasi mendekati ambang.** "Semua sitasi sah" di dev, 89%, masih sedikit di bawah ambang kriteria holdout (90%). Ini risiko yang diketahui sebelum holdout dijalankan.
- **Generalisasi belum terukur.** Ukurannya adalah holdout v2.

## 4. Catatan keterbukaan

- **Satu angka holdout sudah terlihat.** Saat menguji kode `evidence holdout input` di lokal, pengembang melihat jumlah pertanyaan holdout v2 yang lolos gerbang alur v1: 85 dari 120. Pada saat itu skor reranker untuk pertanyaan holdout belum dihitung. Isi pertanyaan, label, dan keluaran apa pun tidak terlihat. Angka itu tidak dipakai untuk memilih atau menyetel apa pun.
- **Validasi penulis.** Validasi set oleh penulis hanya melaporkan hitungan komposisi dan hasil pemeriksaan otomatis.
