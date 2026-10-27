# Penilaian v2, kriteria lolos, dan protokol holdout v2

Dokumen ini dibekukan pada 27 Oktober 2026, sebelum ada keluaran model baru dan sebelum holdout v2 ditulis. Aturan di sini tidak boleh diubah setelah keluaran holdout v2 terlihat. Kode: `src/evidence/penilaian.py` (diuji di `tests/test_penilaian.py`).

Latar belakang ada di `ROOT_CAUSE_ANALYSIS.md`. Aturan kunci v2 dirumuskan setelah kegagalan set tersegel lama terlihat, jadi angka v2 pada set lama hanya diagnosis. Generalisasi diukur pada holdout v2.

## 1. Aturan penilaian v2

### 1.1 Pertanyaan terjawab

Penilaian v2 sama dengan v1, kecuali pemeriksaan kunci fakta:

- **Mode generatif benar** bila jawabannya ditampilkan secara generatif, minimal satu pasal yang dikutip termasuk `gold` atau `gold_alt`, dan semua butir `kunci` ada di kalimat yang ditampilkan menurut `key_hit_v2`.
- **Kutipan langsung benar** bila tidak menolak, pasal kutipan pertama termasuk `gold` atau `gold_alt`, dan semua butir `kunci` ada di kalimat yang dikutip menurut `key_hit_v2`.
- **Kutipan cadangan** dalam mode generatif dinilai dengan aturan kutipan langsung.
- Penolakan (gerbang atau model) pada pertanyaan terjawab dihitung salah.

`key_hit_v2` menerima kunci bila cocok menurut aturan v1 **atau** setelah normalisasi angka:

- ejaan dalam kurung sesudah angka dibuang ("3 (tiga) bulan" menjadi "3 bulan");
- kata bilangan satu sampai dua belas sebelum satuan (bulan, tahun, hari, jam, minggu, kali, orang, m, meter) menjadi angka;
- "%" menjadi "persen";
- "meter" menjadi "m".

Aturan ini tidak pernah lebih ketat dari v1 dan berlaku sama untuk semua mode.

### 1.2 Pertanyaan tak terjawab

Setiap jawaban atas pertanyaan tak terjawab dinilai salah satu dari tiga:

- **menolak**: gerbang atau model menolak. Ini aman.
- **koreksi_premis**: hanya untuk `jenis: "premis_salah"`. Jawaban ditampilkan secara generatif, semua pasal yang dikutip termasuk `pasal_koreksi`, dan semua `kunci_koreksi` ada di kalimat yang ditampilkan (`key_hit_v2`). Ini juga aman. Kedua label ditulis penulis set sebelum keluaran ada.
- **keliru**: selain dua hal di atas, termasuk kutipan cadangan dan jawaban premis salah tanpa label koreksi.

### 1.3 Angka yang dilaporkan

Untuk setiap set, angka v1 dan v2 dilaporkan berdampingan, masing-masing dengan interval Wilson 95%:

- jawaban benar mode generatif;
- kutipan langsung;
- tak terjawab yang dijawab keliru;
- semua sitasi sah, dan minimal satu sitasi sah;
- kalimat yang didukung NLI;
- kalimat tanpa sitasi yang ditampilkan.

## 2. Kriteria lolos holdout v2

Mode generatif dianggap layak menjadi mode utama hanya bila **semua** syarat berikut terpenuhi pada holdout v2. Semua syarat memakai penilaian v2.

| Syarat | Ambang |
| --- | --- |
| Jawaban benar mode generatif (pertanyaan terjawab) | ≥ 70% |
| Dibanding kutipan langsung pada set yang sama | lebih tinggi |
| Tak terjawab yang dijawab keliru | ≤ 10% |
| Semua sitasi sah (jawaban generatif atas pertanyaan terjawab) | ≥ 90% |
| Kalimat tanpa sitasi yang ditampilkan | 0 |

Kutipan langsung di sini adalah mode bawaan situs (BM25, gerbang BM25).

Bila satu syarat saja gagal:

- mode generatif tetap berlabel eksperimental;
- kutipan langsung tetap mode utama;
- Production generatif tidak diaktifkan.

Keputusan akhir tetap di tangan pemilik proyek.

## 3. Protokol holdout v2

1. **Penulis terpisah.** Penulisnya agen AI terpisah, dengan aturan di bagian 4.
2. **Hash lebih dulu.** Hash berkas di-commit ke `eval/holdout-v2.sha256` sebelum evaluasi apa pun. Pengembang tidak membaca isi pertanyaan sebelum holdout dijalankan; validasi hanya mencetak hitungan.
3. **Sistem dibekukan.** Konfigurasi alur v2 dipilih di dev saja dan dibekukan di kode sebelum holdout dijalankan. Holdout tidak dipakai untuk memilih apa pun.
4. **Persetujuan pemilik proyek.** Holdout v2 dijalankan **sekali** lewat workflow khusus, setelah pemilik proyek menyetujui. `eval/holdout-v2/hasil.json` menjadi penanda sekali jalan.
5. **Pembanding pada set yang sama.** Ada tiga pembanding:
   - alur v2;
   - alur v1, yaitu sistem pada set tersegel lama; prompt yang identik memakai ulang keluaran yang sama, jadi panggilan tambahannya sedikit;
   - kutipan langsung.
6. **Hasil apa adanya.** Hasil dilaporkan apa adanya, termasuk bila gagal. Setelah dijalankan, holdout v2 tidak boleh dipakai lagi untuk mengukur generalisasi.

## 4. Aturan penulisan holdout v2 (untuk penulis)

**Bahan.** Bahan yang boleh dibaca:

- `corpus/korpus.json` dan `corpus/manifest.json`;
- bagian 1 dan 4 dokumen ini;
- kode `src/evidence/evalset.py`, `src/evidence/corpus.py`, dan `src/evidence/penilaian.py`, untuk validasi saja.

Bahan yang **tidak boleh** dibaca: isi folder `eval/` (kecuali folder keluaran sendiri), `web/`, dokumen lain, `README.md`, `ROOT_CAUSE_ANALYSIS.md`, `INDUSTRIAL_EVIDENCE_COPILOT_FINAL_HANDOFF.md`, dan riwayat git. Penulis juga tidak menjalankan sistem pencarian atau model apa pun.

**Keluaran.** `eval/holdout-v2/questions.jsonl` dan `eval/holdout-v2/README.md`, yang berisi komposisi dan cara label ditetapkan, tanpa daftar pertanyaan.

**Komposisi.** Total 120 pertanyaan.

- **90 terjawab.**
  - Minimal 55 bergaya `parafrase`: bahasa awam pekerja, pengawas, atau pemilik usaha, dengan istilah sehari-hari yang berbeda dari kata pasal. Contoh polanya: "alat angkat", "dongkrak", "helm retak", "gudang tertutup".
  - Sisanya bergaya `leksikal`: memakai istilah pasal, tetapi tidak menyalin kalimatnya.
  - Pertanyaan tersebar ke ke-15 peraturan, kira-kira sebanding jumlah pasalnya.
  - Jenisnya bervariasi: `angka`, `kewajiban`, `prosedur`, `definisi`, dan `sanksi`.
  - Panjangnya bervariasi.
  - Sertakan pertanyaan yang jawabannya ada di bagian akhir pasal panjang.
- **30 tak terjawab** (`gold: []`, `kunci: []`).
  - **8 berjenis `premis_salah`**, bergaya `dekat`. Masing-masing wajib punya:
    - `pasal_koreksi`: id pasal yang menyatakan fakta yang benar;
    - `kunci_koreksi`: 1 sampai 2 butir fakta yang benar, yang ada di teks cocok pasal itu.
  - **14 bergaya `dekat` lainnya**: topik peraturan yang dikecualikan dari korpus, peraturan yang tidak ada di korpus, BPJS atau iuran, waktu kerja, dan sejenisnya.
  - **8 bergaya `luar`**, di luar topik K3.
  - Ketiadaan jawaban diverifikasi dengan grep atas korpus, dan istilah yang dicari dicatat di `catatan`.

**Kunci.**

- Isinya 1 sampai 3 butir fakta pendek: angka dengan satuan, nama lembaga, atau istilah teknis.
- **Angka ditulis sebagai digit tanpa ejaan dalam kurung.** Contohnya "3 bulan", bukan "3 (tiga) bulan".
- Setiap butir harus lolos `evidence.evalset.key_hit` terhadap `Corpus.match_text` pasal `gold`.
- Tidak boleh ada butir yang seluruh tokennya sudah ada di pertanyaan.
- Jangan memakai kata umum seperti "wajib" atau "pengusaha" sebagai satu-satunya butir.

**`gold` dan `gold_alt`.** `gold` adalah pasal yang paling langsung menjawab. `gold_alt` adalah pasal lain yang juga menjawab secara sah. Alasan setiap `gold_alt`, dan alasan pasal yang sengaja tidak dijadikan alt, dicatat di `catatan`.

**Format baris.** Setiap baris memuat `id` (`h001` sampai `h120`), `tanya`, `gaya`, `gold`, `gold_alt`, `kunci`, `jenis`, `catatan`, dan `split` (selalu `"holdout-v2"`). Baris `premis_salah` juga memuat `pasal_koreksi` dan `kunci_koreksi`.

**Validasi.** Gunakan `evidence.evalset.validate(rows, corpus, splits=("holdout-v2",))`. Untuk baris `premis_salah`, periksa juga:

- `pasal_koreksi` ada di korpus;
- `kunci_koreksi` lolos `key_hit_v2` terhadap teks cocok pasal itu.

Hasil validasi harus 0 masalah.
