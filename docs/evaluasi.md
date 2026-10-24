# Laporan evaluasi

Semua angka berasal dari `eval/results.json` (dihasilkan `evidence eval`, deterministik, sekitar 15 detik). Bila angka di sini berbeda dari berkas itu, berkasnya yang benar.

## Ringkasan jujur

Pada data uji, pasal yang tepat ada di peringkat 1 pada 68% pertanyaan dan di lima teratas pada 90%. Dari 81 jawaban yang diberikan, 23 (28%) mengutip pasal yang salah. Angka ini **optimistis**: pertanyaan ditulis oleh asisten AI pengembang, dan data uji sudah dilihat sebelum desain akhir dibuat. Ini bukan uji tersegel.

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

**Belum dilakukan:** embedding pra-latih multibahasa (misalnya e5). Unduhan model diblokir di lingkungan pengembangan.

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
5. **Penulis tunggal.** Semua pertanyaan dan kunci ditulis satu penulis (AI) yang membaca pasal emasnya. Interval kepercayaan tidak menangkap bias ini. Efek pengelompokan per dokumen kecil (ICC ≈ 0,01 menurut audit).

## Yang diperlukan untuk angka yang lebih dapat dipercaya

- Set uji tersegel yang ditulis orang lain (idealnya praktisi K3) tanpa melihat sistem, hash di-commit sebelum dijalankan, dijalankan sekali.
- Emas tingkat ayat, sehingga ketepatan kalimat yang dipilih dapat diukur.
- Kunci berbentuk frasa dengan angka dan satuan bersebelahan.
- Lebih banyak pertanyaan tak terjawab yang panjang dan bernuansa regulasi.
- Gerbang yang tidak bias panjang pertanyaan (misalnya skor dinormalkan terhadap skor-diri kueri), dikalibrasi pada data yang belum terlihat.
- Pembersihan OCR untuk teks pencocokan.

Detail temuan audit dan statusnya: `docs/audit-evaluasi.md`.
