# Industrial Evidence Copilot: analisis akar masalah hasil set tersegel

Disusun oleh asisten AI pengembang (Claude) pada 27 Oktober 2026, atas permintaan pemilik proyek setelah keputusan sementara bahwa mode generatif belum disetujui untuk Production.

## Ringkasan

1. **Model bahasa bukan sumber utama kegagalan.** Bila pasal emas ada di empat pasal yang dikirim ke model, Llama 3.3 70B menjawab benar 48 dari 50 pertanyaan tersegel (96%) dan 73 dari 81 pertanyaan test (90%). Mengganti model tidak didukung data.
2. **Sekitar 16 dari 24 poin selisih (75% test lawan 51% tersegel) berasal dari cara penilaian, bukan dari sistem.** Penulis set tersegel menulis kunci fakta dalam gaya peraturan ("3 (tiga) bulan"). Penilai kunci mewajibkan setiap kata ada di jawaban, sehingga jawaban "setiap 3 bulan sekali" dinilai salah. Ada 12 jawaban seperti ini, dan semuanya saya periksa manual: isinya benar dan sitasinya benar.
3. **Kegagalan sistem yang nyata terbesar adalah gerbang penolakan.** Gerbang memakai skor BM25 mutlak (ambang 14,0). Ia menolak 17 dari 70 pertanyaan tersegel yang sebenarnya ada jawabannya; pada 14 di antaranya pasal emas justru sudah berada di peringkat 1 setelah reranker. Pertanyaan parafrase dengan bahasa awam ("dongkrak", "APD retak", "gudang tertutup") jarang memakai kata yang sama dengan pasal, sehingga skor BM25-nya rendah. Pada test, 89% pertanyaan parafrase lolos gerbang; pada tersegel hanya 69%.
4. **Kegagalan nyata lain kecil jumlahnya:** pemotongan pasal panjang di prompt (1 kasus tersegel, 1 kasus test), pencarian dan pemilihan pasal (3 kasus), dan satu jawaban yang tidak lengkap.
5. **Dua "pertanyaan tanpa dasar yang dijawab" pada tersegel justru perilaku yang benar.** Keduanya pertanyaan berpremis salah, dan model mengoreksi premisnya dengan sitasi pasal yang tepat. Label set menganggap semua jawaban pada pertanyaan seperti ini sebagai kegagalan.
6. **Mode kutipan langsung punya kelemahan sendiri:** pasal peringkat 1 BM25 salah pada 17 dari 70 pertanyaan tersegel, dan 12 dari 30 pertanyaan tanpa dasar tetap dijawab dengan kutipan.

Angka resmi tersegel tetap 51% dan tidak diubah. Angka "setara angka" dan semua eksperimen di laporan ini dibuat **setelah** kegagalan tersegel terlihat. Jadi angka tersegel di sini hanya diagnosis, bukan evaluasi independen. Generalisasi perbaikan apa pun harus diukur pada set holdout baru.

## 1. Cara analisis dan aturan yang dijaga

- **Tanpa panggilan model.** Semua analisis membaca keluaran yang sudah di-commit, yaitu keluaran model, skor NLI, skor reranker, dan embedding. Tidak ada kuota Workers AI yang terpakai.
- **Rekonstruksi diverifikasi.** Kode `src/evidence/akar_masalah.py` menyusun ulang penilaian per pertanyaan dengan fungsi yang sama dengan evaluasi resmi. Angkanya cocok persis dengan hasil resmi: dev 43/65, test 72/96, tersegel 36/70, dan kutipan langsung 42, 56, dan 30.
- **Pemilihan hanya di dev.** Ambang baru dalam eksperimen dipilih di dev saja, dengan aturan yang sama seperti ambang BM25: skor seimbang tertinggi, dan ambang terkecil bila seri. Test dan tersegel hanya dilaporkan.
- **Set tersegel tidak dipakai untuk menyetel.** Set ini sudah dipakai sekali (`eval/sealed/hasil.json`), dan tidak ada parameter yang dipilih dari set ini.
- **Peninjau manual.** Tinjauan manual dilakukan asisten AI pengembang dan belum diperiksa manusia.
- **Keluaran lengkap.** Rekaman per pertanyaan, ringkasan, dan eksperimen ada di `eval/analisis/akar-masalah.json`. Cara menjalankan: `python -m evidence.akar_masalah`.

## 2. Verifikasi definisi metrik

| Angka | Definisi persis di kode | Penyebut | Catatan |
| --- | --- | --- | --- |
| **89% pasal peringkat pertama** | Hit@1 sistem BM25 + konteks + reranker mMiniLM: pasal peringkat 1 termasuk emas utama atau emas alternatif (`sealed.retrieval`) | 70 pertanyaan terjawab, **tanpa memperhitungkan gerbang** | Ini metrik pencarian saja. Pertanyaan dengan pasal emas di peringkat 1 tetap bisa ditolak gerbang (14 kasus). Mode kutipan memakai BM25 tanpa reranker; Hit@1-nya 66%. |
| **43% kutipan langsung menjawab benar** | 30/70. Benar bila tidak menolak, pasal kutipan pertama termasuk emas atau emas alternatif, dan **semua** token kunci ada di kalimat yang dikutip (teks cocok, ejaan modern) | 70 pertanyaan terjawab | Kutipan menyalin teks pasal, jadi kunci bergaya "3 (tiga) bulan" tidak merugikan mode ini. Perbandingan resmi generatif lawan kutipan karena itu berat sebelah. |
| **82% dukungan sumber** | 56/68 kalimat yang **ditampilkan** dalam jawaban generatif mendapat peluang entailment ≥ 0,5 dari mDeBERTa-xnli. Premisnya jendela 900 karakter terbaik dari pasal yang dikutip kalimat itu | 68 kalimat dari 52 jawaban generatif, termasuk 2 jawaban untuk pertanyaan tanpa dasar | Saya meninjau ke-12 kalimat yang dinilai tidak didukung. 11 sebenarnya didukung pasal yang dikutip (angka atau parafrase benar; penilai NLI keliru). Satu kalimat (s004) tidak lengkap. Jadi 82% adalah batas bawah. |
| **92% ketepatan sitasi** | 46/50. Himpunan pasal yang dikutip jawaban generatif seluruhnya termasuk emas atau emas alternatif | 50 pertanyaan terjawab yang dijawab generatif. Penolakan dan pertanyaan tanpa dasar tidak masuk | "Minimal satu sitasi sah" 49/50. Empat jawaban mengutip pasal tambahan yang bukan emas. Pada s055, pasal tambahan itu memuat ancaman pidana yang sama, jadi bukan sitasi palsu. |
| **51% jawaban benar** | 36/70. Benar bila mode generatif, minimal satu sitasi emas, dan semua token kunci ada di kalimat tampil. Untuk cadangan kutipan berlaku aturan kutipan; gerbang dan penolakan model dihitung salah | 70 pertanyaan terjawab | Pemeriksaan kunci memakai teks tampil, bukan teks cocok. |

## 3. Kegagalan per tahap alur

Setiap pertanyaan terjawab yang salah dimasukkan ke tahap **pertama** yang gagal, menurut alur situs: gerbang, lalu pencarian 20 teratas, lalu pemilihan 4 pasal, lalu model, lalu sitasi, lalu kunci fakta.

| Tahap pertama yang gagal (mode generatif) | Dev (65) | Test (96) | Tersegel (70) |
| --- | --- | --- | --- |
| Benar (resmi) | 43 | 72 | 36 |
| Gerbang BM25 menolak | 15 | 15 | 17 |
| Pencarian: emas tidak di 20 teratas | 0 | 0 | 1 |
| Pemilihan: emas di 20 teratas, bukan 4 teratas | 1 | 0 | 2 |
| Model menolak padahal emas di konteks | 1 | 2 | 1 |
| Model mengutip pasal lain padahal emas di konteks | 0 | 0 | 0 |
| Sitasi emas, kunci fakta tidak cocok | 5 | 7 | 13 |
| ...di antaranya ternyata benar menurut aturan setara angka | 0 | 1 | 12 |

| Tahap pertama yang gagal (kutipan langsung) | Test (96) | Tersegel (70) |
| --- | --- | --- |
| Benar | 56 | 30 |
| Gerbang menolak | 15 | 17 |
| Pasal peringkat 1 BM25 bukan emas | 23 | 17 |
| Pasal benar, kalimat terpilih tanpa kunci | 2 | 6 |

## 4. Mengapa test 75% tetapi tersegel 51%

### 4.1 Uraian selisih

| | Test | Tersegel |
| --- | --- | --- |
| Pertanyaan terjawab | 96 | 70 |
| Lolos gerbang **dan** emas di 4 pasal konteks | 81 (84%) | 50 (71%) |
| Benar bila emas di konteks (setara angka) | 73/81 (90%) | 48/50 (96%) |
| Benar, aturan resmi | 72 (75,0%) | 36 (51,4%) |
| Benar, aturan setara angka (pasca-hoc) | 73 (76,0%) | 48 (68,6%) |

- **Selisih resmi 23,6 poin.** Sekitar 16,2 poin hilang bila kunci dinilai setara angka; ini selisih format label, bukan kualitas jawaban.
- **Sisa sekitar 7 poin berasal dari tahap sebelum model.** Pertanyaan yang sampai ke model dengan bukti yang tepat lebih sedikit (84% lawan 71%). Penyebab utamanya gerbang.
- **Model sendiri justru lebih baik pada tersegel** (96% lawan 90%).

### 4.2 Perbedaan distribusi dan tingkat kesulitan

| Ciri | Dev | Test | Tersegel |
| --- | --- | --- | --- |
| Penulis | asisten AI pengembang | asisten AI pengembang | agen AI terpisah, tidak melihat sistem |
| Kunci per pertanyaan | 3,58 token tunggal | 3,67 token tunggal | 1,47 frasa |
| Pertanyaan dengan kunci berejaan dalam kurung | 0 | 0 | 20 dari 70 |
| Jenis "angka" | 21/65 (32%) | 35/96 (36%) | 42/70 (60%) |
| Parafrase yang lolos gerbang | 31/36 (86%) | 57/64 (89%) | 31/45 (69%) |
| Leksikal yang lolos gerbang | 19/29 | 24/32 | 22/25 |
| Pertanyaan tanpa dasar | 39 | 21 | 30 |
| ...yang lolos gerbang (lebih mirip pertanyaan K3 sungguhan) | 3 | 0 | 12 |
| Panjang pertanyaan (median kata) | 11 | 10 | 10 |

Tiga perbedaan menjelaskan selisih tersebut.

- **Gaya kunci.** Kunci dev dan test berupa token tunggal ("3", "bulan"), sehingga cocok dengan jawaban ringkas model. Kunci tersegel berupa frasa peraturan ("3 (tiga) bulan").
- **Parafrase tersegel benar-benar awam.** Parafrase dev dan test ditulis oleh penulis yang membaca pasalnya, jadi masih memakai kosakata pasal. Parafrase tersegel memakai istilah sehari-hari dan istilah asing ("sepatu safety", "dongkrak", "confined space", "smoke detector"), yang tidak muncul di korpus.
- **Pertanyaan tanpa dasar tersegel lebih sulit.** 12 dari 30 lolos gerbang, sedangkan pada test tidak ada. Model menolak 10 di antaranya dengan benar dan mengoreksi premis pada 2 sisanya. Mode kutipan menjawab 12 dari 30.

## 5. Seluruh jawaban salah pada set tersegel (mode generatif, 34 pertanyaan)

| Kelompok akar masalah | Jumlah | Pertanyaan |
| --- | --- | --- |
| A. Format kunci (penilaian), jawaban sebenarnya benar | 12 | s006, s011, s015, s034, s050, s052, s055, s059, s063, s066, s095, s099 |
| B. Gerbang BM25 menolak, emas di peringkat 1 setelah reranker | 14 | s010, s012, s035, s054, s056, s062, s070, s074, s077, s078, s080, s082, s087, s092 |
| C. Gerbang BM25 menolak, emas di peringkat 3 atau lebih rendah | 3 | s071 (peringkat 3), s001 (peringkat 8), s021 (di luar 20) |
| D. Pencarian: emas tidak di 20 teratas | 1 | s023 |
| E. Pemilihan pasal: emas di 20 teratas, bukan 4 teratas | 2 | s039 (peringkat 5), s043 (peringkat 15) |
| F. Pasal emas dikirim tetapi isinya terpotong di prompt | 1 | s053 |
| G. Jawaban tidak lengkap | 1 | s004 |

### Contoh per kelompok

- **A, s006.** "Seberapa sering buku kerja juru las harus ditunjukkan ke pegawai pengawas?"
  - Jawaban: "Buku kerja juru las harus ditunjukkan kepada Pegawai Pengawas setiap 3 bulan sekali [Pasal 31]."
  - Kunci "3 (tiga) bulan" mewajibkan token "tiga", sehingga jawaban dinilai salah.
  - Pola serupa: "80%" lawan kunci "80" (s034), "1 meter" lawan "1 (satu) m" (s063), "10 m" lawan "10 (sepuluh) m" (s066).
- **B, s080.** "APD retak harus diapakan?"
  - Skor BM25 tertinggi 12,3, di bawah ambang 14,0, jadi pertanyaan ditolak.
  - Reranker menaruh Permenaker 8/2010 Pasal 8, pasal emasnya, di peringkat 1.
  - Pertanyaan pendek dengan bahasa awam memberi skor BM25 rendah walaupun pasalnya tepat. Contoh lain: "Bolehkah forklift diesel dipakai di dalam gudang tertutup?" (s082, skor 8,3).
- **C, s021.** "Kadar oksigen berapa yang dianggap berbahaya di confined space?"
  - Korpus memakai istilah "ruang terbatas", dan definisinya ada di Pasal 1 yang panjang, setelah karakter 1.800.
  - Kasus ini gagal di tiga tahap sekaligus: gerbang, pencarian, dan pemotongan.
- **D, s023.** "Satu smoke detector maksimal melindungi berapa meter persegi lantai?"
  - Korpus memakai "detektor asap" dan "m2", sehingga pasal emas tidak masuk 20 teratas.
  - Model menjawab "TIDAK DITEMUKAN". Ini kegagalan yang aman.
- **E, s039.** "Masa berlaku Lisensi K3 operator forklift?"
  - Empat pasal teratas berasal dari Permenaker 4/2025 (lisensi operator pesawat uap). Pasal emas Permenaker 8/2020 Pasal 162 ada di peringkat 5.
  - Model menolak. Ini juga aman.
- **F, s053.** "Operator crane kelas III boleh mengoperasikan crane berkapasitas sampai berapa?"
  - Pasal emas (Permenaker 8/2020 Pasal 165, 2.698 karakter) ada di peringkat 1, tetapi prompt hanya memuat 1.800 karakter pertama setiap pasal.
  - Ayat (5) tentang kelas III mulai di karakter 1.752, sehingga angka "25 ton" terpotong. Model menjawab "TIDAK DITEMUKAN".
  - Kasus yang sama terjadi di test (q127, kadar oksigen di Pasal 1 Permenaker 11/2023).
- **G, s004.** "Pabrik kecil kami ingin patungan ... untuk mengadakan pelayanan kesehatan kerja bersama, apakah itu diperbolehkan?"
  - Jawaban "Ya, ... diperbolehkan" sesuai Pasal 4, tetapi tidak menyebut syarat pengesahan oleh Direktur.
  - Ini satu-satunya jawaban generatif tampil yang isinya kurang dari yang dibutuhkan.

### Pertanyaan tanpa dasar yang "dijawab" (2 dari 30)

| Pertanyaan | Jawaban model | Penilaian |
| --- | --- | --- |
| s076: "Lisensi K3 operator pesawat uap kan berlaku 10 tahun ... benar?" | Lisensi berlaku 5 tahun [Permenaker 4/2025 Pasal 10], jadi pernyataan 10 tahun tidak benar | Aman; koreksi premis sesuai catatan penulis set ("jawaban aman mengoreksi premis") |
| s088: "Karena PP 50/2012 mewajibkan SMK3 bagi perusahaan dengan paling sedikit 50 pekerja ..." | Ambangnya 100 pekerja atau potensi bahaya tinggi [PP 50/2012 Pasal 5] | Aman; koreksi premis |

Akar masalahnya ada pada label. Pertanyaan berpremis salah diberi emas kosong, padahal korpus memuat fakta yang mengoreksinya. Metrik "dijawab padahal tak terjawab" karena itu menghitung koreksi premis sebagai kegagalan.

## 6. Akar masalah, diurutkan menurut dampak

| No | Akar masalah | Jenis | Dampak tersegel | Dampak test |
| --- | --- | --- | --- | --- |
| AM1 | Penilai kunci tas-kata mewajibkan ejaan angka dalam kurung, "m" atau "meter", dan "%" persis seperti kunci | Evaluasi | 12 jawaban benar dinilai salah | 1 |
| AM2 | Gerbang penolakan memakai skor BM25 mutlak; skornya rendah untuk pertanyaan pendek berbahasa awam walaupun reranker sudah menemukan pasal tepat | Sistem (penolakan) | 17 | 15 |
| AM3 | Prompt memotong setiap pasal di 1.800 karakter pertama, bukan memilih ayat yang relevan | Sistem (pemilihan bukti) | 1 (+1 yang juga gagal di gerbang) | 1 |
| AM4 | Kosakata awam dan istilah asing tidak ada di korpus (BM25 tahap pertama) | Sistem (pencarian) | 3 | 0 |
| AM5 | Label premis salah diperlakukan sebagai "tidak ada jawaban" | Evaluasi | 2 koreksi premis dihitung gagal | 0 |
| AM6 | Penilai NLI negatif palsu pada angka dan parafrase | Evaluasi | 11 dari 12 kalimat "tidak didukung" | sudah ditinjau sebelumnya (14 dari 15) |
| AM7 | Jawaban model tidak lengkap | Sistem (generasi) | 1 | beberapa kasus daftar panjang |
| AM8 | Mode kutipan: pasal peringkat 1 BM25 salah dan tidak ada penolakan selain gerbang | Sistem (mode kutipan) | 17 salah pasal, 12 tanpa dasar dijawab | 23 salah pasal |

## 7. Hasil pengujian offline (tanpa inferensi)

### 7.1 Penilaian ulang kunci "setara angka" (pasca-hoc)

Aturannya: jawaban dianggap memuat kunci bila cocok menurut aturan resmi **atau** setelah normalisasi. Normalisasinya:
- angka berejaan dalam kurung cukup ditulis angkanya;
- kata bilangan sebelum satuan waktu dianggap angka;
- "%" sama dengan "persen", dan "meter" sama dengan "m".

Aturan ini tidak pernah lebih ketat dari aturan resmi (diuji di `tests/test_akar_masalah.py`).

| Mode generatif | Dev | Test | Tersegel |
| --- | --- | --- | --- |
| Resmi | 43/65 | 72/96 | 36/70 |
| Setara angka | 43/65 | 73/96 | 48/70 |

Ke-12 kasus yang berubah di tersegel sudah saya baca satu per satu; semuanya benar secara isi dan sitasi. Aturan ini dibuat setelah melihat kegagalan tersegel, jadi 48/70 tidak boleh disebut hasil evaluasi independen.

### 7.2 Mode kutipan langsung dengan urutan reranker dan gerbang gabungan

Ambang reranker dipilih di dev saja dan hasilnya 1,0. Gerbang gabungan berarti pertanyaan lolos bila BM25 ≥ 14,0 **atau** skor reranker pasal teratas ≥ 1,0.

| Varian kutipan langsung | Dev benar | Dev tanpa dasar dijawab | Test benar | Test tanpa dasar dijawab | Tersegel benar (diagnosis) | Tersegel tanpa dasar dijawab |
| --- | --- | --- | --- | --- | --- | --- |
| X0 BM25, gerbang BM25 (situs sekarang) | 42/65 | 3/39 | 56/96 | 0/21 | 30/70 | 12/30 |
| X1 urutan reranker, gerbang BM25 | 45/65 | 3/39 | 73/96 | 0/21 | 42/70 | 12/30 |
| X2 urutan reranker, gerbang gabungan | 54/65 | 5/39 | 83/96 | 2/21 | 48/70 | 13/30 |

Catatan untuk tabel ini:
- Test sudah pernah dilihat sebelum desain akhir, jadi angka test di sini juga bukan bukti generalisasi.
- Urutan reranker hanya tersedia di peramban setelah model reranker (sekitar 510 MB) diunduh. Saat ini unduhan itu hanya terjadi di mode generatif.

### 7.3 Batas atas gerbang gabungan untuk mode generatif

Gerbang gabungan akan meloloskan pertanyaan terjawab yang sekarang ditolak dan pasal emasnya sudah ada di empat pasal konteks:

| | Dev | Test | Tersegel |
| --- | --- | --- | --- |
| Pertanyaan terjawab yang akan lolos, emas di konteks | 13 | 13 | 7 |
| Pertanyaan tanpa dasar yang menambah panggilan model | 2/39 | 2/21 | 1/30 |

- **Ini batas atas, bukan hasil.** Jawaban model untuk pertanyaan-pertanyaan tersebut belum pernah dibangkitkan.
- **Biaya mengukurnya kecil.** Untuk dev cukup sekitar 15 panggilan model, jauh di bawah kuota harian.
- **Gerbang ini tidak menyelesaikan seluruh AM2.** Di tersegel ia hanya mengangkat 7 dari 15 pertanyaan yang emasnya sudah di konteks.

## 8. Penilaian opsi perbaikan

| Opsi | Bukti | Biaya inferensi | Rekomendasi |
| --- | --- | --- | --- |
| Hybrid retrieval BM25 + e5 | Pada tersegel Hit@1 hibrida e5-large 0,80, lebih rendah dari BM25 + reranker mMiniLM 0,886. Pencarian hanya menyebabkan 3 kegagalan | Tidak ada LLM, tetapi menambah unduhan model embedding | Jangan dulu. Manfaatnya kecil dibanding AM2 dan AM3 |
| Pemilihan bukti tingkat ayat (ganti potongan 1.800 karakter dengan ayat paling relevan menurut BM25 atau reranker di dalam pasal) | Mengatasi AM3 (s053, q127) | Tidak bertambah; anggaran token sama | Ya. Ukur offline dengan metrik baru "kunci masuk prompt" di dev, lalu verifikasi dengan sedikit panggilan |
| Gerbang gabungan BM25 atau reranker | Dev kutipan 45 → 54 dari 65; batas atas generatif +13 di dev | +2 panggilan per 39 pertanyaan tanpa dasar di dev | Ya, untuk kedua mode. Ambang sudah dipilih di dev |
| Verifikasi kutipan (pemeriksaan sitasi pascagenerasi) | Sudah ada. 0 kalimat tanpa sitasi tampil; 49/50 jawaban punya sitasi emas | Tidak ada | Pertahankan. Tambahkan pemeriksaan bahwa angka di kalimat muncul di pasal yang dikutip (deterministik, tanpa model) |
| Jawaban ekstraktif terstruktur dengan urutan reranker | X1 test 56 → 73 dari 96; dev 42 → 45 dari 65 | Tidak ada LLM | Ya, sebagai cadangan di mode generatif. Untuk mode kutipan tanpa reranker, perbaikan gerbang saja |
| Ganti model LLM | Bila bukti ada di konteks: 96% tersegel, 90% test | Kuota untuk evaluasi ulang | Tidak. Data tidak menunjukkan model sebagai hambatan |
| Mengubah prompt | Penolakan model pada bukti yang ada hanya 1 kasus tersegel, dan penyebabnya pemotongan | Kuota | Tidak, kecuali setelah AM3 diperbaiki dan masih ada penolakan |

## 9. Rekomendasi dan rencana berikutnya

Urutan ini menjaga kejujuran evaluasi. Pertama, perbaikan penilaian dibekukan. Kedua, sistem disetel di dev saja. Ketiga, satu set holdout baru dijalankan sekali.

1. **Bekukan aturan penilaian v2 sebelum ada data baru.**
   - Aturan kunci setara angka (7.1) menjadi metrik utama, dan angka aturan lama tetap dilaporkan berdampingan.
   - Pertanyaan berpremis salah diberi kategori sendiri, "koreksi premis". Jawaban yang mengoreksi premis dengan sitasi sah dihitung aman, ditinjau manual.
   - Tinjauan manual sampel tetap dilakukan untuk kalimat yang dinilai NLI tidak didukung.
2. **Perbaiki AM2 dan AM3, keduanya dipilih di dev.**
   - Gerbang gabungan dengan ambang reranker 1,0, yang sudah dipilih di dev.
   - Pemilihan ayat di dalam pasal panjang.
   - Cadangan kutipan memakai urutan reranker bila reranker sudah dimuat.
3. **Ukur di dev dengan sedikit panggilan.**
   - Hanya pertanyaan dev yang keputusan gerbangnya atau isi prompt-nya berubah, sekitar 15 sampai 30 panggilan.
   - Bandingkan dengan baseline yang sekarang memakai aturan penilaian yang sama.
4. **Siapkan set holdout v2 sebelum mengukur generalisasi.**
   - Penulis terpisah yang tidak melihat sistem, laporan ini, maupun set tersegel lama. Minimal 100 pertanyaan dengan porsi parafrase awam yang jelas.
   - Aturan penulisan kunci dan label premis salah ditulis lebih dulu.
   - Hash di-commit sebelum dijalankan, lalu dijalankan sekali dengan kode yang sudah dibekukan. Biayanya sekitar 70 sampai 100 panggilan model, muat dalam satu hari kuota.
5. **Tetapkan kriteria lolos sebelum holdout v2 dijalankan.** Usulan, untuk diputuskan pemilik proyek:
   - jawaban benar mode generatif ≥ 70% dan lebih tinggi dari kutipan langsung pada set yang sama;
   - jawaban keliru pada pertanyaan tanpa dasar ≤ 10%;
   - semua sitasi sah ≥ 90%;
   - tidak ada kalimat tanpa sitasi yang ditampilkan.
6. **Sampai holdout v2 lolos:**
   - kutipan langsung tetap mode bawaan dan fitur utama;
   - mode generatif ditandai "eksperimental" di situs, bukan "utama";
   - Production generatif tetap tidak diaktifkan.

## 10. Batasan analisis

- **Peninjau tunggal.** Tinjauan manual (12 kasus format kunci, 12 kalimat NLI, 2 koreksi premis) dilakukan asisten AI pengembang dan belum diperiksa manusia.
- **Set tersegel sudah terkontaminasi.** Sekarang set itu sudah dibaca per pertanyaan untuk analisis ini, jadi tidak boleh dipakai lagi sebagai bukti generalisasi.
- **Batas atas, bukan hasil.** Efek gerbang gabungan dan pemilihan ayat pada mode generatif belum diukur.
- **Test bukan holdout.** Angka test bukan holdout bersih; perbaikan yang terlihat di test bukan bukti generalisasi.
- **Contoh tersegel sedikit.** Hanya 70 pertanyaan terjawab, jadi interval kepercayaannya lebar (51%: 40 sampai 63%).

## 11. Reproduksi

```
pip install -e ".[dev]"
python -m evidence.akar_masalah        # menulis eval/analisis/akar-masalah.json, tanpa inferensi
pytest -q tests/test_akar_masalah.py
```

Masukan: `eval/cache/gen/bertahan-llama-3.3-70b/*.jsonl`, `eval/cache/nli/skor.json`, `eval/cache/rerank/mminilm/skor.json`, `eval/results.json`, `eval/sealed/questions.jsonl`, dan `eval/questions.jsonl`.
