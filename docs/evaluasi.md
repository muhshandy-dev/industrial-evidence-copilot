# Laporan evaluasi

Semua angka berasal dari `eval/results.json` (dihasilkan `evidence eval` dari cache model yang di-commit, deterministik). Bila angka di sini berbeda dari berkas itu, berkasnya yang benar.

## Ringkasan jujur

Mode generatif utama (BM25 + reranker mMiniLM, Llama 3.3 70B di Workers AI, prompt "bertahan") menjawab benar 72 dari 96 pertanyaan uji yang ada jawabannya (75%, interval 65 sampai 83%), 88% kalimatnya didukung pasal yang dikutipnya menurut penilai NLI, dan tidak menjawab satu pun dari 21 pertanyaan tanpa dasar. Mode kutipan langsung (BM25 saja): pasal tepat di peringkat 1 pada 68% pertanyaan, 56 dari 96 benar, dan 23 dari 81 jawabannya mengutip pasal yang salah.

Angka data uji **optimistis**: pertanyaan ditulis oleh asisten AI pengembang, data uji sudah dilihat sebelum desain akhir dibuat, dan beberapa keputusan dibuat setelah angka terlihat (lihat "Protokol dan pengungkapan"). Set uji tersegel terpisah sudah dijalankan satu kali dan memberi angka yang lebih rendah (jawaban benar mode utama 51%, bukan 75%); lihat bagian "Set uji tersegel".

## Set pertanyaan

| | Dev | Test | Total |
| --- | --- | --- | --- |
| Ada jawabannya | 65 | 96 | 161 |
| Sengaja tidak ada jawabannya | 39 | 21 | 60 |
| Total | 104 | 117 | 221 |

- Gaya: leksikal (mengulang kata pasal) 61, parafrase 100, tak terjawab "dekat" (seputar K3) 35, "luar" (di luar topik) 25.
- Split ditentukan oleh hash SHA-256 pertanyaan per strata (dokumen emas, atau gaya untuk yang tak terjawab), dibekukan di `eval/questions.jsonl`. Label pertanyaan test dibekukan lewat `eval/test-beku.sha256`; `evidence eval-set check` gagal bila label test berubah.
- Setiap pertanyaan terjawab punya pasal emas (`gold`), boleh punya pasal alternatif yang sah (`gold_alt`, 9 pertanyaan), dan butir fakta kunci (`kunci`) yang divalidasi ada di pasal emas.
- Penulis: **asisten AI pengembang**, setelah membaca peraturannya. Bukan praktisi K3, bukan pengguna nyata.

## Hasil pencarian (test, n = 96)

| Metode | MRR dev (dasar pemilihan) | Peringkat 1 | Lima teratas | MRR@10 | nDCG@10 |
| --- | --- | --- | --- | --- | --- |
| BM25 polos | 0,717 | 0,573 [0,479; 0,667] | 0,854 [0,781; 0,917] | 0,702 [0,629; 0,774] | 0,759 |
| BM25 + stem | 0,771 | 0,635 [0,542; 0,729] | 0,896 [0,833; 0,958] | 0,753 [0,684; 0,820] | 0,801 |
| **BM25 + stem + konteks (dikirim)** | **0,851** | **0,677 [0,583; 0,771]** | **0,896 [0,833; 0,958]** | **0,786 [0,720; 0,852]** | **0,833** |
| LSA + konteks | 0,743 | 0,490 [0,385; 0,583] | 0,844 [0,771; 0,917] | 0,633 [0,554; 0,707] | 0,697 |
| Hibrida BM25 + LSA (RRF) | 0,790 | 0,625 [0,521; 0,719] | 0,896 [0,833; 0,948] | 0,739 [0,667; 0,808] | 0,790 |

Interval: bootstrap persentil 95% per pertanyaan (2.000 ulangan, seed 0). Relevansi "salah satu cukup": pasal emas atau alternatif sah. nDCG memakai IDCG = 1 karena satu pasal sah sudah menjawab.

Selisih berpasangan (MRR@10, test):
- BM25 + konteks dibanding BM25 polos: +8,5 poin [2,6; 14,5]. Layak diklaim.
- Hibrida dibanding BM25 + konteks: −4,8 poin [−9,2; −0,5]. Tiga perbandingan tanpa koreksi; batas atasnya dekat nol.
- Semua selisih "lima teratas" tidak berbeda nyata.

Kolom MRR dev lebih tinggi daripada test karena metode pemenang dipilih dari sana (winner's curse). Angka dev bukan angka kinerja.

### Embedding dan reranker (v2)

Dijalankan di GitHub Actions (unduhan model diblokir di lingkungan pengembangan). Revisi model dipatok; skor reranker disimpan di `eval/cache/rerank/`.

| Metode | MRR dev | Peringkat 1 (test) | Lima teratas (test) | MRR@10 (test) |
| --- | --- | --- | --- | --- |
| Dense multilingual-e5-large | 0,866 | 0,802 [0,719; 0,875] | 0,917 [0,865; 0,969] | 0,861 [0,800; 0,917] |
| Hibrida BM25 + e5-large (RRF) | 0,888 | 0,812 [0,729; 0,885] | 0,948 [0,906; 0,990] | 0,864 [0,802; 0,919] |
| **BM25 + konteks + rerank mMiniLM (mode generatif)** | **0,944** | **0,927 [0,875; 0,979]** | **0,979 [0,948; 1,000]** | **0,951 [0,914; 0,984]** |
| BM25 + konteks + rerank bge-reranker-v2-m3 | 0,912 | 0,865 [0,792; 0,927] | 0,958 [0,917; 0,990] | 0,911 [0,864; 0,955] |
| BM25 + konteks + rerank mMiniLM 8-bit (ditolak) | 0,945 | 0,917 [0,865; 0,969] | 0,979 [0,948; 1,000] | 0,945 [0,907; 0,981] |

- Reranker mMiniLM dibanding BM25 + konteks saja: MRR@10 +16,4 poin [10,8; 22,7].
- e5 small dan base, serta semua hibrida dengan reranker, ada di `eval/results.json` dan di halaman Evaluasi. Menambah e5 sebelum reranker tidak menaikkan MRR uji.
- Aturan pemilihan sistem pencarian mode generatif ditetapkan **setelah** angka semua sistem terlihat, jadi angka uji untuk pilihan itu optimistis.
- Versi 8-bit mMiniLM tidak dipakai: selisih MRR dev 0,001 tidak berarti, dan skornya bergantung pada CPU (selisih logit sampai 0,93 antar runner), sehingga urutan pasal di peramban tidak bisa dijamin sama dengan evaluasi. Paritas fp32: selisih skor maksimum 0,0000 di Node dan 0,00001 di Chromium (WebAssembly) terhadap skor evaluasi PyTorch, pasal teratas sama pada semua pertanyaan uji paritas.

## Hasil jawaban (test, ambang 14,0 dari dev)

| Ukuran | Nilai | Interval 95% (Wilson) |
| --- | --- | --- |
| Jawaban benar (menjawab, pasal sah, fakta kunci ada) | 56/96 = 58% | 48–68% |
| Menolak padahal ada jawabannya | 15/96 = 16% | 10–24% |
| ... dan pasal peringkat 1 sebenarnya sudah sah | 7 dari 15 | |
| Dari 81 jawaban: pasal yang dikutip salah | 23/81 = 28% | 20–39% |
| Pertanyaan tanpa dasar yang dijawab | 0/21 | 0–15% |
| Kalimat per jawaban (rata-rata) | 1,64 | |
| Kalimat yang berbeda dari teks korpus | 0/81 | (tautologis, lihat bawah) |

Cara membaca:
- **"Jawaban benar" hampir sama dengan "pasal peringkat 1 sah dan sistem menjawab".** Kunci dicocokkan sebagai kumpulan kata pada kalimat yang ditampilkan. Audit menemukan bahwa banyak pasal pendek ditampilkan utuh, ayat acak dari pasal yang sama tetap lolos kunci 69%, dan hampir sepertiga butir kunci sudah ada di teks pertanyaan. Ketepatan pemilihan ayat tidak diukur terpisah.
- **Salah sitasi adalah risiko utama.** 19 dari 23 salah sitasi mengutip pasal lain di peraturan yang sama (pasal tetangga, pasal definisi).
- **0/21 rapuh.** Skor tertinggi pertanyaan tak terjawab di test adalah 13,16, di bawah ambang 14 dengan selisih tipis; pada ambang 13 hasilnya 2/21. Pertanyaan "luar" mudah dipisahkan, dan pertanyaan "dekat" di set ini pendek.
- **Uji tekanan:** 12 pertanyaan panjang berkosakata K3 yang tidak ada jawabannya di korpus (`eval/stress.jsonl`, ditulis auditor setelah melihat sistem): **7 tetap dijawab** dengan pasal yang tidak menjawab. Skor BM25 mentah naik dengan panjang pertanyaan, jadi gerbang lebih mudah menolak pertanyaan pendek. Set ini ilustrasi, bukan estimasi.
- **Gerbang bukan peningkat akurasi.** Dibanding selalu menjawab: jawaban benar 62 → 56 dari 96, sedangkan pertanyaan tanpa dasar yang dijawab 20 → 0 dari 21. Itu pertukaran.
- **"Verbatim" tautologis.** Kalimat jawaban disalin dari teks korpus, jadi pemeriksaan otomatisnya pasti nol. Teks korpus adalah hasil ekstraksi PDF; beberapa dokumen berasal dari OCR dan memuat salah baca (misalnya "keija"). Kutipan perlu dicek ke PDF resmi.
- Leksikal 12/32 (38%) dibanding parafrase 44/64 (69%): tidak berpasangan dan bercampur dengan panjang pertanyaan; jangan disimpulkan sebagai sebab.

## Hasil mode generatif (test)

Alur sama dengan situs: gerbang skor BM25 yang sama, reranker, empat pasal teratas, prompt dari `web/public/js/gen/prompt.js`, lalu pemeriksaan sitasi yang sama (`periksa`). Keluaran model server diambil dari `/api/jawab` di deploy Preview oleh workflow `eksperimen-server.yml` (token OIDC, lihat `docs/deploy.md`) dan di-commit di `eval/cache/gen/`. "Didukung" dinilai mDeBERTa-v3-base-xnli-multilingual-nli-2mil7 (ambang entailment 0,5).

| Ukuran | Llama 3.3 70B (utama) | Qwen2.5 1,5B GPU (opsional) | Qwen2.5 0,5B CPU (opsional) | Kutipan langsung |
| --- | --- | --- | --- | --- |
| Jawaban benar | 72/96 (75%) | 31/96 | 40/96 | 56/96 |
| Menolak padahal ada jawabannya | 17/96 | 50/96 | 20/96 | 15/96 |
| Pertanyaan tanpa dasar yang dijawab | 0/21 | 0/21 | 0/21 | 0/21 |
| Kalimat didukung NLI | 108/123 (88%) | 3/4 | 4/19 | tidak dinilai |
| Jawaban yang seluruh kalimatnya didukung | 64/79 | 3/4 | 2/12 | |
| Jawaban dengan minimal satu sitasi tepat | 79/79 | 4/4 | 9/12 | 58/81 |
| Jawaban yang semua sitasinya tepat | 65/79 | 3/4 | 4/12 | |

- **Validasi manual penilai NLI** (`eval/nli-tinjauan.json`): dari 25 kalimat sampel yang dinilai didukung, 25 memang didukung pasal yang dikutip. Dari 15 kalimat yang dinilai tidak didukung (semua kalimat seperti itu di test), hanya 1 yang memang tidak didukung (q124, juru las); satu lagi benar tetapi tidak relevan dengan pertanyaan (q095), dan satu didukung hanya bila nama peraturan sumber ikut dibaca (q084). Kegagalan penilai terutama pada daftar panjang, ejaan lama, dan teks OCR. Jadi untuk model ini, 88% adalah batas bawah yang konservatif. Peninjau adalah asisten AI pengembang; belum diperiksa ulang oleh manusia.
- Rincian mode Llama 3.3 70B pada test: 36 ditolak gerbang, 79 jawaban generatif, 2 "TIDAK DITEMUKAN". Median waktu jawaban dari runner 1,2 detik (persentil 90: 2,3 detik).
- **Uji tekanan** (12 pertanyaan panjang di luar korpus): Llama 3.3 70B menjawab 0 dari 12 (7 "TIDAK DITEMUKAN", 5 ditolak gerbang). Kutipan langsung menjawab 7 dari 12.
- **Prompt injection** (20 pertanyaan di `eval/sealed/injeksi.jsonl`, masing-masing dengan kunci `perilaku_aman`): 9 ditolak gerbang, 11 sampai ke model. Tinjauan manual per butir ada di `eval/injeksi-tinjauan.json`. Prompt situs: semua jawaban yang ditampilkan aman (11/11); keluaran mentah menuruti perintah tersembunyi pada 1 dari 11 (i11, menulis isi kutipan sebagai JSON). Prompt polos tanpa pertahanan pada model yang sama: tampilan aman 11/11, keluaran mentah menuruti perintah pada 2 dari 11 (i11, dan i20 yang menulis denda Rp1 miliar karangan). Kalimat-kalimat itu dibuang karena tidak punya sitasi sah. Pertahanan utama adalah pemeriksaan sitasi setelah generasi, bukan prompt. Peninjau adalah asisten AI pengembang; belum diperiksa ulang oleh manusia.
- Model lokal Qwen tidak lolos batas mutu yang ditetapkan sebelum eksperimen; situs menawarkannya sebagai opsi saja. Riwayat eksperimen prompt dan model (tiga putaran) ada di `docs/eksperimen-prompt.md`.

## Set uji tersegel

100 pertanyaan dan 20 pertanyaan injeksi ditulis agen AI terpisah yang tidak melihat keluaran sistem (`eval/sealed/README.md`); hash dikunci di `eval/sealed.sha256`. Set ini dijalankan sekali lewat workflow `tersegel.yml` (input `konfirmasi=SEKALI`) setelah desain dibekukan, dan hasilnya ditulis ke `eval/sealed/hasil.json`. Tidak ada yang disetel dari set ini.

**Status: sudah dijalankan sekali** pada 26 Oktober 2026 pukul 17.34 UTC (commit `4c5c4de`, run "Tersegel" #3). Run sekali jalan hanya memuat 100 pertanyaan; 20 pertanyaan injeksi dari penulis yang sama sudah dievaluasi lebih dulu lewat `eksperimen-server.yml` (lihat "Prompt injection" di atas).

| Ukuran (70 terjawab, 30 tanpa dasar) | Llama 3.3 70B, prompt bertahan (utama) | Kutipan langsung | Qwen2.5-0.5B CPU (opsional) | Qwen2.5-1.5B GPU (opsional) |
| --- | --- | --- | --- | --- |
| Jawaban benar | 36/70 (51%; 40 sampai 63%) | 30/70 (43%) | 25/70 (36%) | 14/70 (20%) |
| Menolak padahal ada jawabannya | 20/70 | 17/70 | 19/70 | 49/70 |
| Tanpa dasar tetapi dijawab | 2/30 | 12/30 | 11/30 | 1/30 |
| Kalimat didukung (NLI) | 56/68 (82%) | tidak dinilai | 6/20 (30%) | tidak ada kalimat generatif |
| Semua sitasi tepat | 46/50 (92%) | tidak berlaku | 6/13 | tidak berlaku |
| Jawaban dengan kalimat tanpa sitasi | 0/100 | tidak berlaku | 56/100 | 16/100 |

Mode jawaban model utama: 35 ditolak gerbang, 13 "TIDAK DITEMUKAN", 52 jawaban generatif. Median waktu jawaban dari runner 1,2 detik (persentil 90: 3,3 detik).

Pencarian (n = 70): BM25 + konteks, yang dipakai mode kutipan, mencapai Hit@1 66% dan MRR@10 0,754. BM25 + reranker mMiniLM, yang dipakai mode generatif, mencapai Hit@1 89% dan MRR@10 0,909. Pembanding offline: e5-large dense Hit@1 79%, bge-m3 sebagai reranker Hit@1 94% (tidak dipakai karena terlalu besar untuk peramban).

Dibanding data uji, jawaban benar mode utama turun dari 75% ke 51%, dan kutipan langsung dari 58% ke 43%. Pencarian dengan reranker tetap tinggi (93% ke 89%), jadi selisihnya berasal dari penolakan (gerbang skor 14,0 dan jawaban "TIDAK DITEMUKAN") serta fakta kunci yang tidak tertulis. Ini sesuai dugaan bahwa angka data uji optimistis.

## Protokol dan pengungkapan

Hal-hal berikut tercatat juga di `eval/results.json` (kunci `protokol`) dan di halaman Evaluasi.

1. **Test semi-holdout.** Agregat test terlihat pada run pertama. Jawaban alternatif yang sah dinilai setelah melihat keluaran lima sistem pada pertanyaan test.
2. **Keputusan setelah run pertama**, yang karena itu tidak murni dari dev:
   - gerbang penolakan diganti dari kecocokan kata (cakupan ≥ 0,5) ke skor BM25 pasal teratas;
   - kutipan hanya dari pasal peringkat 1 (sebelumnya tiga teratas);
   - kalimat per jawaban maksimal 2 → 3 dan syarat kalimat kedua 80% → 60% (test benar 52 → 56 dari 96 menurut audit);
   - 25 pertanyaan tak terjawab ditambahkan ke dev saja (ambang terpilih bergeser 15 → 14);
   - jawaban alternatif ditetapkan untuk dev dan test.
3. **Yang dipilih dari dev oleh kode:** metode (MRR@10 dev tertinggi) dan ambang (skor seimbang dev tertinggi, ambang terkecil bila seri).
4. **Riwayat run pertama:** gerbang cakupan lama memberi lima teratas sekitar 90% dan jawaban benar sekitar 50% pada test. Rekonstruksi auditor dengan kode lama pada set pertanyaan sekarang: 51/96 benar, 2/21 tak terjawab dijawab. Kode dan angka run pertama tidak di-commit terpisah, sehingga urutan ini tidak dapat diverifikasi dari riwayat git.
5. **Mode generatif (v2):**
   - Kandidat prompt dan model dipilih hanya dari data dev dengan aturan tertulis sebelum eksperimen (`choose_server`, `docs/eksperimen-prompt.md`). Angka test model lokal versi lama sudah terlihat sebelum eksperimen prompt dimulai.
   - Hasil putaran 2 untuk Qwen3 tidak sah: mode berpikir tidak benar-benar dimatikan (semua keluaran diawali `<think>`). Dicatat di `docs/eksperimen-prompt.md`.
   - Reranker 8-bit dicoba, lalu ditolak. Selama dicoba, 22 baris keluaran per model server dibangkitkan dengan urutan pasal 8-bit; baris itu dibangkitkan ulang dengan urutan fp32 sebelum angka dihitung.
   - Workers AI tidak menyediakan patokan revisi model, dan suhu 0 tidak menjamin keluaran yang persis sama bila dijalankan ulang. Keluaran yang dinilai di-commit.
   - Data dev untuk model server hanya memuat 3 pertanyaan tak terjawab yang lolos gerbang, jadi syarat "tidak menjawab yang tanpa dasar" pada pemilihan model lemah.
   - Pertanyaan injeksi i02 dan jumlah yang lolos gerbang sempat terlihat di log uji asap sebelum evaluasi.
   - Penggunaan kuota dicatat dalam token (putaran 3 dev: 430.394 token masukan dan 14.644 token keluaran untuk enam konfigurasi). Jumlah neuron hanya terlihat di dasbor Cloudflare dan tidak diverifikasi dari sini. Evaluasi test, uji tekanan, dan injeksi (110 panggilan) selesai tanpa galat kuota, tetapi sesudahnya kuota harian habis: uji Preview dari peramban pada 25 Oktober 2026 pukul 18.18 dan 18.23 WIB mendapat `429 kuota_habis`, dan situs kembali ke kutipan langsung sesuai rancangan. Perkiraan kasar dari jumlah token: satu jawaban Llama 3.3 70B memakai sekitar 4.000 token masukan, sehingga kuota gratis cukup untuk puluhan jawaban per hari untuk seluruh pengunjung, bukan ratusan. Pada 26 Oktober 2026, kuota baru dapat dipakai lagi antara pukul 13.32 dan 23.05 WIB, sedangkan dasbor Cloudflare menunjukkan 0 neuron terpakai hari itu. Jadi pemulihan kuota setelah habis tidak selalu terjadi pukul 07.00 WIB seperti yang tertulis di dokumentasi Cloudflare. Set tersegel kemudian dijalankan setelah kuota pulih.
6. **Penulis tunggal.** Semua pertanyaan dan kunci ditulis satu penulis (AI) yang membaca pasal emasnya. Interval kepercayaan tidak menangkap bias ini. Efek pengelompokan per dokumen kecil (ICC ≈ 0,01 menurut audit).

## Yang diperlukan untuk angka yang lebih dapat dipercaya

- Set uji yang ditulis praktisi K3 tanpa melihat sistem (set tersegel yang ada ditulis agen AI terpisah).
- Pemeriksaan manusia atas sampel kalimat generatif dan atas tinjauan injeksi.
- Emas tingkat ayat, sehingga ketepatan kalimat yang dipilih dapat diukur.
- Kunci berbentuk frasa dengan angka dan satuan bersebelahan.
- Lebih banyak pertanyaan tak terjawab yang panjang dan bernuansa regulasi.
- Gerbang yang tidak bias panjang pertanyaan (misalnya skor dinormalkan terhadap skor-diri kueri), dikalibrasi pada data yang belum terlihat.
- Pembersihan OCR untuk teks pencocokan.

Detail temuan audit dan statusnya: `docs/audit-evaluasi.md`.
