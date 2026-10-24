> Laporan audit independen apa adanya, ditulis sebelum perbaikan. Jalur `/tmp/...` merujuk ke ruang kerja sesi pengembangan dan tidak ada di repositori. Status tiap temuan ada di `docs/audit-evaluasi.md`.

# Audit independen evaluasi RAG — Industrial Evidence Copilot

Auditor: subagen audit (tidak mengubah berkas repo). Tanggal: 2026-10-24.
Objek: commit `e2ad3e2` (branch `claude/project-thread-8fnhl3`). Selama audit, agen lain menambahkan
commit `bef7b08` dan mengubah berkas web/CLI. Karena itu semua analisis dijalankan dari salinan
`git archive HEAD` di scratchpad, bukan dari pohon kerja yang sedang berubah. Bila relevan,
`bef7b08` dibahas terpisah.

Reproduksi: `evalrag.run()` dipanggil langsung dengan keluaran ke scratchpad (perintah
`evidence eval` menulis `eval/results.json` di repo, jadi tidak dipakai). Hasilnya **identik** dengan
`eval/results.json` yang di-commit, kecuali blok `lingkungan`. Waktu jalan sekitar 14 detik. Hash input:
questions `52059e47…`, korpus `ce78c6f1…`. `pytest`: 18 lulus.

Skrip analisis independen (di luar repo):
`/tmp/claude-0/-home-user/ab38709b-d745-58c4-a2ca-f6eb82a5d10f/scratchpad/analyze.py`, `analyze2.py`,
`analyze3.py`, beserta keluarannya `*.out` dan `fail_pairs.txt` di folder yang sama.

---

## Ringkasan

| ID | Keparahan | Temuan |
|---|---|---|
| A1 | **kritis** (untuk klaim) | Set test bukan holdout bersih: ada intipan agregat, pooling per pertanyaan atas keluaran test, dan tidak ada jejak audit run pertama |
| A2 | **penting** | Ada penyetelan yang tidak diungkap (MAX_UNITS 2→3, SECOND_RATIO 0,8→0,6; test +4,2 poin). Teks "hanya ambang yang disetel" salah |
| A3 | penting | `merge_frozen` membekukan id/split tetapi tidak membekukan label. Gold/kunci/gold_alt test bisa diubah diam-diam |
| A4 | penting | Ajudikasi gold_alt tidak konsisten, ada pertanyaan test yang ambigu, dan kunci alt tidak divalidasi |
| A5 | kecil | 25 pertanyaan tak terjawab tambahan di dev menggeser ambang (15→14) |
| B1 | **kritis** (untuk makna metrik) | "Jawaban benar" pada praktiknya sama dengan "pasal peringkat 1 benar dan tidak menolak". Kunci hampir tidak menguji ayat yang ditampilkan, dan metrik naik terus bila teks yang ditampilkan makin panjang |
| B2 | penting | Kualitas kunci: 29% butir kunci ada di teks pertanyaan, beberapa kunci generik, dan nomor ayat "(1)" menjadi token "1" |
| B3 | penting | Uji verbatim tautologis. "Verbatim" diukur terhadap teks hasil ekstraksi/OCR (≥43 pasal mengandung derau OCR), bukan terhadap dokumen resmi |
| B4 | **penting** | Gerbang skor BM25 mentah bias terhadap panjang kueri (r=0,62). Pertanyaan pendek ditolak, pertanyaan panjang di luar cakupan dijawab (7/12 probe) |
| B5 | kecil | nDCG dengan gold_alt, baseline acak, top_score untuk LSA/hibrida, stem pada cakupan, dokumentasi basi |
| B6 | penting | Klaim website soal penyebab kegagalan keliru: 19/23 salah sitasi terjadi di dalam peraturan yang sama |
| C1–C6 | penting | Ukuran sampel, winner's curse dev, rapuhnya ambang, perbandingan berpasangan, dan klaim per kategori |
| D1–D4 | penting | Pertanyaan tak terjawab: "luar" terlalu mudah, "dekat" pendek dan generik, sebagian ternyata separuh terjawab |
| F1–F6 | kecil–penting | Hasil per-pertanyaan test ikut diekspor (bef7b08), tidak ada tes untuk evalset/evalrag, flag OCR manifest salah, klaim "ditulis tangan" |

Angka inti yang bisa dipertahankan (test, `bm25_konteks`, ambang 14):
- Pasal sah di peringkat 1: **67,7%** (bootstrap 58–77%, n=96).
- Pasal sah di 5 teratas: **89,6%** (83–96%).
- Jawaban benar: **58,3%** (Wilson 48–68%).
- Dari 81 jawaban yang diberikan, **23 mengutip pasal yang tidak sah (28%, Wilson 20–39%)**.
- Pertanyaan tak terjawab yang tetap dijawab: **0/21** (batas atas 15,5%). Angka ini rapuh, lihat B4/C5/D.

---

## A. Kebocoran, kontaminasi, dan protokol dev/test

### A1 — Set test sudah "terpakai"; klaim "test dilaporkan sekali" tidak benar (kritis untuk klaim)
**Bukti.**
1. Fakta proses: run pertama menampilkan angka test agregat sebelum perubahan apa pun.
2. Pooling gold_alt dilakukan untuk **semua** pertanyaan test berdasarkan kandidat dari lima sistem, dengan penilaian manual. Itu berarti pengembang melihat keluaran peringkat **per pertanyaan test** dari setiap sistem. Kebocorannya lebih dari sekadar intipan agregat.
3. Semua perubahan desain berikutnya (jenis gerbang, sumber kutipan hanya peringkat 1, MAX_UNITS/SECOND_RATIO, lihat A2) dibuat setelah dua hal di atas.
4. Tidak ada jejak audit. Set pertanyaan, hasil, dan perubahan kode masuk dalam **satu** commit (`git show --stat e2ad3e2`). Kode dan angka run pertama tidak pernah di-commit, sehingga urutan "dev dulu, test sekali" tidak bisa diverifikasi dari repo.
5. `eval/results.json` menyimpan `kegagalan_test` lengkap dengan teks pertanyaan (`evalrag.py:263-295`) dan `sapuan_test` 41 ambang (`evalrag.py:334-347`). `bef7b08` menambahkan `per_pertanyaan` (termasuk test) dan `cmd_export` menyalin semuanya ke `web/public/data/evaluasi.json`. Setiap iterasi berikutnya yang membaca berkas ini sudah terkontaminasi.

**Dampak terukur.** Gerbang lama (cakupan ≥0,5, kutipan dari 3 pasal teratas, 2 unit; kode dari `58139ff`) pada test: **51/96 benar, 2/21** tak terjawab dijawab. Pipeline sekarang: **56/96, 0/21**. Di dev: 33/65 dan 6/39 menjadi 42/65 dan 3/39. Perubahan ini juga memperbaiki dev, jadi keputusan itu masuk akal. Tetapi ambang lama 0,5 tidak pernah disetel, sehingga perbandingan sebelum/sesudah ini tidak setara. Ambang 14 yang dipilih dari dev **kebetulan juga optimum di test** (`sapuan_test`: skor seimbang test tertinggi di 14 dan 15).

**Perbaikan.**
- Sebut set test sebagai "semi-holdout (sudah diintip; label diajudikasi setelah melihat keluaran sistem)".
- Commit angka run pertama apa adanya.
- Buat holdout baru yang tersegel: pertanyaan ditulis orang lain (idealnya praktisi K3, bukan model yang membaca dokumen), hash di-commit sebelum run pertama, kunci ditetapkan sebelum melihat keluaran, satu kali run.
- Pindahkan `kegagalan_test`, `sapuan_test`, dan `per_pertanyaan` ke berkas terpisah, dan jangan ekspor ke web sebelum ada holdout baru.

### A2 — Penyetelan yang tidak diungkap (penting)
**Bukti.** `git diff 58139ff e2ad3e2 -- src/evidence/answer.py` menunjukkan `MAX_UNITS = 2 → 3` dan `SECOND_RATIO = 0.8 → 0.6`, selain penggantian gerbang dan pembatasan ke peringkat 1. Efeknya (eksperimen auditor, ambang 14):

| MAX_UNITS / SECOND_RATIO | dev benar | test benar | rata-rata unit |
|---|---|---|---|
| 1 / — | 36/65 | 48/96 | 1,00 |
| 2 / 0,8 (lama) | 40/65 | 52/96 | 1,20 |
| **3 / 0,6 (dikirim)** | 42/65 | **56/96** | 1,57 |
| 5 / 0,0 | 44/65 | 58/96 | 2,46 |

Pernyataan berikut salah atau menyesatkan:
- `results.json["aturan"]`: "Hanya ambang penolakan yang disetel… Test dilaporkan sekali."
- Docstring `evalrag.py:3-6`: "Satu-satunya yang disetel adalah ambang penolakan." Di file yang sama, metode juga dipilih dari dev (baris 317-320).
- `evalset.py:5`.
- `web/public/js/evaluation.js:113`: "Yang disetel hanya ambang penolakan dan pilihan metode."
- `evaluation.js:124`: "pertanyaan yang dikunci sebelum evaluasi". 25 pertanyaan dev dan label gold_alt test berubah setelah run pertama.

**Perbaikan.** Daftarkan semua keputusan pasca-run-pertama: gerbang, top-1, MAX_UNITS, SECOND_RATIO, 25 pertanyaan dev, gold_alt, grid k1/b, dan pilihan metode. Untuk tiap keputusan, catat data yang menjadi dasarnya. Perbaiki ketiga teks di atas.

### A3 — Label test tidak dibekukan (penting)
**Bukti.** `evalset.py:82-84`: `out.append({**d, "id": keep["id"], "split": keep["split"]})`. Untuk pertanyaan lama, semua field kecuali id/split diambil dari draf. Gold, kunci, gold_alt, dan gaya pertanyaan test bisa berubah tanpa peringatan, dan validasi hanya memeriksa konsistensi dengan korpus. Saat ini draf dan `questions.jsonl` identik (diperiksa), tetapi gold_alt untuk q088, q126, dan q179 (test) jelas ditambahkan setelah run pertama.
**Perbaikan.** Simpan hash per baris test (termasuk label) di berkas terpisah yang ikut di-commit. `merge_frozen` harus menolak perubahan label test kecuali ada flag eksplisit dan entri changelog.

### A4 — Pooling dan ajudikasi gold_alt (penting; dampak angka kecil)
**Dampak terukur.** Hanya 9 pertanyaan yang punya gold_alt (6 dev, 3 test: q088, q126, q179). hit@1 test 0,6667 (ketat) menjadi 0,6771 (1 pertanyaan). Efek MRR test: konteks +0,005, hibrida +0,007, LSA +0,002, polos/stem 0. Efeknya sedikit menguntungkan sistem yang dipooling, tetapi tidak mengubah urutan. Jawaban benar test tetap 56 dengan maupun tanpa gold_alt.

**Masalah.**
- **Tidak konsisten.** q152 (test, "Siapa yang menilai penerapan SMK3… lewat audit?") menolak `permenaker-26-2014#pasal-3` ("Audit Eksternal SMK3 oleh Lembaga Audit SMK3 yang ditunjuk oleh Menteri"). Pasal itu jawaban sah yang setara dengan emas `pp-50-2012#pasal-16`, dan di dev pasal 26-2014 diterima sebagai alt untuk q046/q076. q185 menolak `permenaker-8-2010#pasal-2` ayat (3) ("APD wajib diberikan oleh pengusaha secara cuma-cuma"), yang bisa diperdebatkan sebagai sah. Arah biasnya dua-duanya: label juga terlalu ketat.
- **Pertanyaan test yang ambigu diselamatkan dengan alt.** q126 "Kapan pemeriksaan dan pengujian khusus dilakukan?" tidak menyebut objeknya. q179 "perpanjangan lisensi operator" tidak menyebut operator apa. Keduanya mendapat alt dari peraturan lain setelah keluaran sistem terlihat.
- **Kunci alt tidak divalidasi.** `validate` (`evalset.py:137-140`) hanya memeriksa gold. Alt q012 `permenaker-8-2020#pasal-163` tidak memuat kunci "bekerja" karena teks OCR berbunyi "bekeija". Alt ini dihitung relevan untuk metrik peringkat, tetapi tidak akan pernah bisa "benar" di metrik jawaban.

**Perbaikan.** Tulis pedoman ajudikasi. Nilai secara buta (penilai tidak tahu sistem mana yang mengusulkan) dan pakai penilai kedua untuk test. Validasi kunci pada alt. Tulis ulang pertanyaan yang ambigu, atau tandai `ambigu` dan keluarkan dari angka utama.

### A5 — 25 pertanyaan tak terjawab tambahan hanya di dev (kecil)
Penambahan ini menjaga test tetap utuh. Namun pertanyaan tambahan ditulis setelah kegagalan run pertama terlihat, lalu dipakai untuk memilih ambang. Bila hanya dev asli dipakai, ambang terpilih menjadi **15** (skor seimbang 0,808), bukan 14. Bootstrap pemilihan di dev (500×) memberi ambang 13–16 (persentil 5–95). Proporsi tak terjawab dev (39/104) kini berbeda jauh dari test (21/117). Skor seimbang tidak bergantung pada proporsi, jadi hal ini tidak fatal, tetapi angka dev dan test tidak bisa dibandingkan langsung.

### A6 — Pasal emas yang dipakai dev dan test (kecil, bukan masalah)
7 pertanyaan test berbagi pasal emas dengan dev. Kemiripannya rendah (Jaccard token maksimum 0,46: q104 dan q038 menanyakan fakta berbeda dari pasal yang sama). Hanya ambang dan metode yang dipilih dari dev, jadi ini bukan kebocoran berarti.

---

## B. Validitas metrik dan implementasi

### B1 — "Jawaban benar" hampir sama dengan "pasal peringkat 1 benar" (kritis untuk makna metrik)
**Bukti** (`analyze2.py`, untuk 102 jawaban dengan sitasi benar di dev dan test):
- 71/102 berasal dari pasal yang hanya punya ≤3 unit, sehingga **seluruh pasal ditampilkan** dan pemilihan ayat tidak teruji sama sekali.
- Bila ayat terpilih diganti dengan **ayat acak dari pasal yang sama** (jumlahnya sama), kunci tetap lolos **68,9%**. Bila diganti dengan *k* unit pertama pasal, lolos **75,5%**.
- Kunci gagal pada pasal yang benar hanya 4 kali (q011, q039 dev; q105, q121 test). Di test: sitasi benar 58, jawaban benar 56.
- Seperti tabel A2, metrik naik monoton dengan jumlah unit yang ditampilkan (48 menjadi 58 dari 96). Metrik ini memberi hadiah pada keluaran yang bertele-tele dan tidak punya komponen presisi.

Kunci tetap membedakan **pasal**: ayat acak dari pasal acak hanya lolos 0,27%. Tetapi untuk itu kunci tidak menambah informasi di luar uji sitasi.

**Perbaikan.**
- Laporkan metrik ini terus terang sebagai "pasal sah di peringkat 1 dan sistem menjawab".
- Tambahkan emas tingkat ayat/butir, lalu syaratkan ayat emas ada di unit yang ditampilkan.
- Laporkan panjang jawaban (rata-rata unit atau karakter) di samping akurasi.
- Lakukan penilaian manusia atas sampel jawaban.

### B2 — Kualitas kunci (penting)
**Bukti.**
- **172/585 butir kunci (29,4%) seluruh tokennya ada di teks pertanyaan.** Pemilih unit memaksimalkan cakupan istilah pertanyaan, jadi butir seperti ini lolos dengan sendirinya. Contoh: q165 `['lisan']`, q173 `['banding']`, q141 `['dokter']`, q129 `['sni','standar']`, q148 `['menteri','membentuk']`.
- **Kunci yang tidak menguji isi jawaban.** q119 "Apa sanksi bagi pengurus…" berkunci `['diancam','hukuman']`, padahal yang seharusnya diuji adalah besar sanksinya. q133/q190 `['pengawas','ketenagakerjaan']` cocok dengan banyak pasal pengawasan.
- **Angka kecil.** Ada 58 butir kunci berupa angka 1–2 digit. `_RE_TOKEN` (`evalset.py:22`) mengubah penanda ayat "(1)" menjadi token "1". Token "1" ada di 412/622 pasal, "2" di 406, "3" di 242, "5" di 97. Auditor memeriksa ulang dengan penanda ayat/pasal dibuang. **Saat ini tidak ada** kunci yang lolos hanya karena penanda, jadi belum ada inflasi angka. Tetapi pemeriksaannya rapuh.
- **Tas-token.** Kunci "5 tahun" lolos bila "5" dan "tahun" muncul di mana saja dalam 1–3 ayat, termasuk "(5)" sebagai nomor ayat. Ekuivalensi angka dan kata ("lima" vs "5") tidak ditangani, dan kunci ditulis dengan pilihan bentuk yang tidak seragam (q022 `tiga bulan`, q088 `3 bulan`).

**Perbaikan.** Cocokkan frasa dengan syarat angka dan satuan bersebelahan. Buang penanda penomoran sebelum tokenisasi. Normalisasi angka dan kata. Larang kunci yang seluruhnya merupakan subset kata pertanyaan. Wajibkan minimal satu kunci "isi" (angka, nama lembaga, nama peraturan).

### B3 — Uji verbatim tautologis; "verbatim" dibandingkan dengan teks OCR (penting)
**Bukti.**
- `Evidence.text` diambil dari `split_units(display_texts[ci])` (`answer.py:94-99`), lalu `evalrag.py:181` memeriksa apakah string yang sama (setelah normalisasi spasi) ada di `shown[ci]`. Ini benar secara konstruksi.
- Jalur fallback (`answer.py:95-96`, yang menampilkan teks ejaan modern) tidak pernah terpicu: 0 dari 18 pasal berejaan lama. Angka "0 dari 81" adalah sifat kode, bukan hasil pengukuran.
- Teks pembanding adalah hasil ekstraksi PDF, bukan dokumen resmi. Pemindaian sederhana menemukan **≥43 pasal** berderau OCR: permenaker-8-2020 38, 37-2016 4, 2-1982 1. Contoh: "keija", "bekeija", "ketenagakeijaan", "pemah", "pcrundang". `permenaker-37-2016#pasal-65` bahkan berakhir dengan "imHiiiVMpimiiyiji.il 11.1 n", dan pasal ini muncul sebagai kutipan untuk q135 di test.
- Derau ini juga merusak pencarian (kueri "kerja" tidak cocok dengan "keija") dan penilaian kunci (q012-alt).

**Perbaikan.** Ganti istilahnya menjadi "kutipan identik dengan teks korpus (hasil ekstraksi PDF/OCR)". Bandingkan sampel kutipan dengan PDF secara manual. Bersihkan OCR (minimal ganti `keija`→`kerja`) untuk teks pencocokan, sementara teks tampilan diberi tanda "teks OCR".

### B4 — Gerbang skor BM25 mentah bias terhadap panjang kueri (penting)
**Bukti** (`analyze3.py`):
- Korelasi Pearson jumlah istilah unik kueri dengan skor BM25 peringkat 1 (pertanyaan terjawab): **0,62**.
- Tingkat penolakan pada pertanyaan terjawab menurut jumlah istilah: 0–3 istilah 100%, 4 istilah 50%, 5 istilah 54%, 6–7 istilah 15%, ≥8 istilah 8%.
- **15 dari 30** penolakan pada pertanyaan terjawab terjadi saat pasal peringkat 1 sebenarnya **benar**. Di test: q080, q081, q082, q126, q138, q141, q194. Contoh: q081 "Apa tujuan pembentukan P2K3?" skor 13,95 dengan peringkat 1 benar.
- Pertanyaan leksikal lebih pendek (rata-rata 6,25 istilah vs 8,24 untuk parafrase) dan lebih sering ditolak (test: 8/32 = 25% vs 7/64 = 11%). Ini sebagian menjelaskan "leksikal lebih buruk dari parafrase".
- Sebaliknya, **probe auditor**: 12 pertanyaan panjang berkosakata K3 yang tidak terjawab di korpus (topik peraturan yang dikecualikan, BPJS, perancah, APAR, ketinggian, dan lain-lain). **7/12 dijawab** dengan skor 14,2–21,2, padahal pasal yang dikutip tidak menjawab. Contoh: "Apa sanksi pidana bagi pengusaha yang tidak mendaftarkan tenaga kerjanya dalam program jaminan sosial…" mengutip `permenaker-3-1998#pasal-5` (skor 21,2). "Berapa nilai ambang batas kebisingan…" mengutip `kepmenaker-187-1999#pasal-15` (16,0). Probe ini bukan bagian dari set resmi dan ditulis auditor, jadi angkanya ilustrasi, bukan estimasi.

**Perbaikan.** Normalisasi skor, misalnya terhadap skor-diri kueri (BM25 kueri atas dokumen ideal) atau terhadap jumlah istilah. Atau gabungkan skor dengan cakupan dan selisih skor peringkat 1 dan 2. Kalibrasi per kelompok panjang kueri. Tambahkan pertanyaan tak terjawab yang panjang dan dekat (lihat D2).

### B5 — Ketidakkonsistenan implementasi kecil (kecil)
- **nDCG dengan gold_alt** (`metrics.py:29`, `evalrag.py:95`). Ideal-DCG memakai |gold ∪ alt| seolah semua alternatif wajib ditemukan. Akibatnya menambah alt bisa **menurunkan** nDCG: q013 dengan 4 bukti sah, hit sempurna di peringkat 1 hanya mendapat nDCG ≈ 0,39. Gunakan nDCG dengan ideal = 1 untuk relevansi "salah satu", atau keluarkan nDCG.
- **Baseline acak** (`evalrag.py:123-129`) memakai `len(r["gold"])` tanpa alt dan menggabungkan dev dan test. Baseline ini juga tidak informatif (0,8% hit@5). Pembanding yang berarti adalah BM25 polos.
- **`top_score` selalu dari BM25** (`evalrag.py:163-169`) walaupun metodenya LSA/hibrida. Tidak berpengaruh pada sistem yang dikirim, tetapi salah bila metode diganti.
- **Cakupan di `extract_answer`** memakai `tokenize(query)` dengan stem default (`answer.py:87,90,100`), apa pun `use_stem` sistemnya. Untuk `bm25_polos`, kunci idf tidak sejalan.
- **Hanya test yang punya `metrik_ketat`.** Dev tidak dilaporkan.
- **Dokumentasi basi.** Komentar "ambang tetap 0,5" di `evalrag.py:328` tidak diimplementasikan. Docstring `evalrag.py:6` bilang "semua interval bootstrap", padahal jawaban memakai Wilson. `answer.py:8` merujuk `docs/evaluasi.md` yang tidak ada (folder `docs/` kosong).

### B6 — Penjelasan kegagalan di website keliru (penting)
`evaluation.js:101` mengatakan "Kegagalan terbanyak adalah salah memilih pasal ketika **beberapa peraturan** memuat kalimat yang mirip." Data menunjukkan **19/23** salah sitasi di test terjadi **di dalam peraturan yang sama**. Polanya berulang: "masa berlaku lisensi 5 tahun" tertukar dengan pasal tetangga "lisensi hanya berlaku selama bekerja di perusahaan" (q104, q113, q155, q192). Begitu juga pasal definisi dan pasal pelaksana. Penjelasan untuk leksikal (`evaluation.js:94`) juga spekulatif. Data menunjuk ke panjang kueri dan gerbang (B4).

---

## C. Kecukupan statistik

**C1 — Ukuran sampel.**
- Test terjawab n=96, sehingga interval proporsi kira-kira ±10 poin.
- Test tak terjawab hanya n=21 (12 dekat, 9 luar). Hasil 0/21 punya batas atas Wilson 15,5%, dan per kategori 24% (dekat) dan 30% (luar). Klaim per kategori tidak bermakna.
- Selisih leksikal vs parafrase (37,5% vs 68,8%) tidak berpasangan dan dikacaukan oleh panjang kueri dan komposisi dokumen (B4).

**C2 — Korelasi antarpertanyaan.**
- Test: 96 pertanyaan, 88 pasal unik, 15 dokumen.
- ICC tingkat dokumen untuk "jawaban benar" ≈ 0,011, dengan efek desain ≈ 1,06.
- Bootstrap klaster per dokumen memberi [0,49; 0,69], per pasal [0,48; 0,68], sedangkan bootstrap iid dan Wilson memberi [0,48; 0,68].
- Jadi pengelompokan per dokumen **bukan** penyebab utama interval terlalu optimistis. Pernyataan `evaluation.js:114` menunjuk sebab yang salah.
- Ketergantungan yang lebih besar tidak bisa diukur: semua pertanyaan dan kunci ditulis oleh satu penulis (model AI) yang membaca pasal emasnya. Bahkan pada "parafrase", 63–67% istilah pertanyaan (setelah stem) ada di pasal emas. Ini masalah validitas eksternal, bukan masalah lebar interval.

**C3 — Perbandingan berpasangan.**
- `bm25_konteks − bm25_polos`: MRR@10 +0,085 [0,026; 0,145]. Layak diklaim.
- `hybrid − bm25_konteks`: MRR −0,048 [−0,092; −0,005]. Layak dengan catatan: tiga perbandingan tanpa koreksi, dan batas atasnya dekat nol.
- Semua selisih hit@5 tidak signifikan.
- `evaluation.js:86` membenarkan keputusan "situs hanya memuat BM25" dengan angka test. Ini bertentangan dengan `evaluation.js:81` ("dipilih hanya dari data dev").
- **Gerbang vs selalu menjawab** (test, berpasangan): gerbang **tidak pernah** menyelamatkan jawaban benar (0) dan kehilangan 6 (62 menjadi 56). Imbalannya: jawaban salah pada pertanyaan terjawab turun 34 → 25, dan seluruh 20 jawaban "tanpa dasar" (dari 21) dihindari. Itu pertukaran yang sah, tetapi klaim "gerbang meningkatkan akurasi" salah.

**C4 — Winner's curse.** Sistem yang dikirim dipilih dengan MRR dev: dev MRR 0,851 dan hit@1 0,800, sedangkan test 0,786 dan 0,677. Angka dev tidak boleh dikutip sebagai kinerja. `evaluation.js:113` menampilkan jawaban benar dev (64,6%).

**C5 — Ambang rapuh.** Skor maksimum pertanyaan tak terjawab di test 13,16, dan ambang 14. Pada ambang 13, hasil "dijawab padahal tak terjawab" menjadi 2/21 (9,5%). Angka 0/21 bergantung pada margin 0,84 poin skor dan pada pertanyaan tak terjawab yang pendek (B4/D2).

**C6 — Interval.** Bootstrap persentil dengan seed 0 yang sama untuk semua metrik itu wajar. Wilson untuk proporsi juga tepat. Masalahnya bukan metode interval, tetapi bias seleksi dan penulisan yang tidak tercakup interval.

---

## D. Desain pertanyaan tak terjawab

**D1 — "Luar" terlalu mudah (penting).**
- AUC skor (terjawab vs luar) di test **1,000**, di dev 0,964.
- **Panjang kueri saja** sudah memisahkan "luar" dengan AUC 0,89 (rata-rata 4,2 istilah).
- Pertanyaan seperti "Apa rukun Islam?" atau "Apa itu fotosintesis?" mendapat skor 0 atau di bawah 10.
- Meski begitu, "luar" pun tidak sempurna: q215 (dev) "Siapa penemu bola lampu pijar?" mendapat skor 18,2 dan **dijawab** dengan `permenaker-2-1983#pasal-25`.
- **Perbaikan.** Jangan campur "luar" ke angka utama. Laporkan "dekat" terpisah sebagai angka utama penolakan.

**D2 — "Dekat" pendek dan generik (penting).**
- AUC "dekat" di test 0,96, dengan 12 pertanyaan. Skor maksimum 13,16, tepat di bawah ambang.
- Probe B4 menunjukkan pertanyaan dekat yang lebih panjang dan bernuansa regulasi lolos 7/12.
- Kategori yang tidak diuji: premis salah (angka berbeda dari pasal), peraturan yang salah disebut, topik dari peraturan yang dikecualikan (Permenaker 5/2018, 9/2016, 6/2017, 38/2016, 18/2016), dan pertanyaan dua-langkah.
- **Perbaikan.** Tambahkan setidaknya 50 pertanyaan dekat yang panjang dan tersegel di holdout baru, ditulis tanpa melihat skor.

**D3 — Sebagian "tak terjawab" sebenarnya separuh terjawab (kecil).**
- q171 (test) "ketentuan K3 untuk pekerjaan penyelaman": UU 1/1970 Pasal 2 ayat (2) huruf h secara eksplisit mencakup "dilakukan penyelaman, pengambilan benda dan pekerjaan lain didalam air".
- q199 (dev) "jenis alat pelindung pendengaran…": `permenaker-8-2010#pasal-3` memuat "pelindung telinga" (bagian redamannya memang tidak ada).
- Penolakan pada pertanyaan seperti ini dihitung "benar" padahal ada jawaban parsial.
- **Perbaikan.** Tambahkan label `sebagian` atau tulis ulang pertanyaannya.

**D4 — Verifikasi tak terjawab tidak terdokumentasi (kecil).** Tidak ada catatan pemeriksaan (misalnya grep istilah kunci) bahwa korpus memang tidak memuat jawabannya. Pemeriksaan grep auditor untuk 25 istilah tidak menemukan masalah lain selain D3.

---

## E. Klaim untuk README dan website

Lihat daftar di akhir dokumen. Teks website yang saat ini sudah salah atau menyesatkan (`bef7b08:web/public/js/evaluation.js` dan `method.js`):
- `:110` "pertanyaan **ditulis tangan**". Pertanyaan ditulis oleh model AI pengembang.
- `:111` sudah jujur ("bukan pertanyaan nyata pengguna"), tetapi tidak menyebut bahwa penulisnya AI.
- `:113` "Yang disetel hanya ambang… dan pilihan metode" (A2).
- `:124` "dikunci sebelum evaluasi" (A1/A3).
- `:81` "sebelum data uji dilihat" (A1).
- `:69` menyebut "menjawab tanpa dasar" sebagai "bentuk halusinasi yang relevan", sementara risiko yang lebih besar secara angka, yaitu **28% jawaban mengutip pasal yang tidak sah**, tidak punya kartu.
- `:70` dan `method.js:44`: "dicocokkan huruf demi huruf dengan teks pasalnya" dan "selalu dapat dicocokkan dengan teks aslinya". Ini tautologis, dan teksnya hasil OCR (B3).
- `:101` penyebab kegagalan (B6). `:114` penyebab interval (C2).

---

## F. Temuan lain

- **F1 (penting).** Selama audit, agen lain meng-commit `bef7b08`, yang menambahkan `per_pertanyaan` (termasuk test) ke `results.json` dan `cmd_export`, yang menyalin seluruh hasil ke web. Setelah dipublikasikan, test tidak bisa lagi dipakai sebagai holdout. Konsekuensi ini perlu dinyatakan.
- **F2 (penting).** Tidak ada tes untuk `evalset.py` (`key_hit`, `assign_split`, `merge_frozen`, `validate`) maupun `evalrag.py`. Tes `test_wilson_nol_dari_n_tetap_punya_batas_atas` memakai n=21, persis jumlah tak terjawab test. Ini mengindikasikan tes ditulis setelah hasil test terlihat.
- **F3 (kecil).** Flag `ocr` di manifest tidak andal. `permenaker-2-1982` ditandai `ocr: false`, padahal lapisan teksnya berisi galat OCR ("pemah"). `permenaker-8-2020`, dengan 188 pasal (30% korpus), punya 38 pasal berderau.
- **F4 (kecil).** Komposisi pertanyaan tidak proporsional terhadap korpus: permenaker-8-2020 adalah 30% pasal tetapi hanya 15/161 pertanyaan. Kinerja agregat lebih mewakili dokumen kecil daripada distribusi korpus.
- **F5 (kecil).** `evidence eval` menimpa `eval/results.json` di repo tanpa opsi keluaran lain, sehingga reproduksi independen otomatis mengubah repo. Sebaiknya tambahkan `--out`.
- **F6 (kecil).** `cmd_eval` mencetak angka test ke terminal pada setiap run. Ini memudahkan intipan berulang selama pengembangan.

---

## Daftar klaim untuk dokumentasi

### Klaim yang BOLEH (dengan angka test, n, interval, dan catatan wajib)
1. "Korpus: 15 peraturan K3 (622 pasal) dari JDIH dengan hash SHA-256. Peraturan lain tidak tercakup, dan status berlaku per tanggal akses."
2. "Jawaban bersifat ekstraktif: setiap kalimat yang ditampilkan disalin dari teks pasal dalam korpus, tidak ditulis oleh model bahasa. Teks korpus berasal dari ekstraksi PDF dan OCR, dan dapat memuat salah baca."
3. "Pada 96 pertanyaan uji (ditulis oleh pengembang berbasis AI setelah membaca peraturannya), pasal yang sah ada di peringkat 1 pada 68% pertanyaan (interval 95%: 58–77%) dan di lima teratas pada 90% (83–96%)."
4. "Sistem menjawab 81 dari 96 pertanyaan yang ada jawabannya. Dari jawaban itu, sekitar 7 dari 10 mengutip pasal yang sah (72%, interval 61–80%), dan **sekitar 1 dari 4 mengutip pasal yang salah**. Selalu periksa pasal yang dikutip."
5. "'Jawaban benar' (menjawab, pasal sah, dan memuat butir fakta kunci) 58% (48–68%). Dalam praktik, ukuran ini hampir sama dengan 'pasal peringkat 1 sah'."
6. "Pada 21 pertanyaan uji yang sengaja tidak ada jawabannya, sistem menolak semuanya (batas atas 95%: 15%). Sebagian besar pertanyaan itu pendek atau jelas di luar topik. Pertanyaan panjang yang terdengar seperti K3 masih bisa dijawab dengan pasal yang tidak relevan."
7. "Gerbang penolakan adalah pertukaran: dibanding selalu menjawab, gerbang mengorbankan 6 jawaban benar (62 menjadi 56 dari 96) untuk menghindari 9 jawaban salah dan 20 jawaban atas pertanyaan tanpa dasar (dari 21)."
8. "BM25 dengan stem dan konteks judul lebih baik daripada BM25 polos pada MRR@10 (+8,5 poin, interval 2,6–14,5). Gabungan BM25+LSA tidak lebih baik daripada BM25+konteks pada set ini."
9. "Set uji telah dilihat sebelum perubahan desain akhir, dan label alternatifnya diajudikasi setelah melihat keluaran sistem. Angkanya lebih baik dibaca sebagai perkiraan optimistis daripada sebagai uji tersegel."

### Klaim yang DILARANG
1. "Tidak ada halusinasi", "bebas halusinasi", "jawaban selalu benar", "terverifikasi", atau "dapat dipercaya tanpa memeriksa pasal". Bertentangan dengan 28% salah sitasi.
2. "Kutipan identik dengan dokumen resmi" atau "dicocokkan huruf demi huruf dengan teks asli" tanpa catatan OCR dan tautologi (B3).
3. "Sistem menolak semua pertanyaan di luar cakupan" atau "0% menjawab tanpa dasar" tanpa n=21, batas atas, dan catatan bahwa pertanyaannya mudah (D1, D2, B4).
4. Angka dev apa pun sebagai kinerja, misalnya "hit@1 80%" atau "jawaban benar 65%".
5. "Data uji tidak tersentuh", "test dilaporkan sekali", "hanya ambang yang disetel", "pertanyaan dan label dikunci sebelum evaluasi", atau "metode dipilih sebelum data uji dilihat".
6. "Pertanyaan ditulis tangan", "pertanyaan nyata pengguna", atau "mewakili pengguna/praktisi K3".
7. "Jawaban benar berarti fakta jawabannya ditampilkan" tanpa catatan B1, atau klaim apa pun tentang ketepatan **ayat** yang dipilih.
8. "Gerbang penolakan meningkatkan akurasi."
9. Klaim kausal atau kategoris: "sistem memahami parafrase", "leksikal lebih sulit karena kalimat mirip di banyak peraturan", "kegagalan utama karena beberapa peraturan mirip", atau perbandingan "dekat" vs "luar".
10. Generalisasi ke "peraturan K3 Indonesia" secara umum, ke peraturan yang dikecualikan, atau ke nasihat hukum dan kepatuhan.
11. "Interval sempit/pasti", atau menyatakan pengelompokan per dokumen sebagai sumber utama ketidakpastian (C2).
