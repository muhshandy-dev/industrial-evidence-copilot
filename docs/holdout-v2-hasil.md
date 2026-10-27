# Hasil holdout v2 (sekali jalan)

**Keputusan: FAIL.** Satu dari lima kriteria lolos yang dibekukan tidak terpenuhi, yaitu sitasi semua sah (62/70 = 88,6%, ambang 90%). Empat kriteria lain terpenuhi. Pemilik proyek menerima hasil ini tanpa mengubah standar kelulusan dan menutup tahap eksperimen: proyek berstatus **RAG Research Prototype**, kutipan langsung menjadi satu-satunya mode di domain produksi, dan mode generatif tetap prototipe riset di deploy Preview. Tidak ada holdout baru dan tidak ada penyetelan memakai set ini.

## Pelaksanaan

| Hal | Nilai |
|---|---|
| Waktu | 27 Oktober 2026, hasil ditulis 10.30 UTC |
| Run | GitHub Actions 40483481061 (workflow `holdout-v2.yml`, konfirmasi SEKALI) |
| Commit yang dievaluasi | `ef7df3d` (sama dengan `1ea6e9c` yang dibekukan, ditambah izin workflow di `server/oidc.js`) |
| Commit hasil | `2581e6e` (`eval/holdout-v2/hasil.json`, keluaran model, skor NLI) |
| Set | 120 pertanyaan (90 terjawab, 30 tanpa dasar), sha256 `b8be17a7...ed4e` sesuai hash yang di-commit sebelum run |
| Model | Llama 3.3 70B (fp8-fast) lewat Workers AI Free, varian prompt `bertahan` |
| Terkunci | kutipan `bm25_konteks`, ambang BM25 14,0, ambang reranker 1,0, penilaian v2 |

Percobaan sebelumnya (run 40482477581) berhenti pada panggilan pertama dengan `401 workflow_ditolak`. Tidak ada keluaran model atau hasil yang terbentuk. Perbaikannya hanya izin workflow; rinciannya di `docs/alur-v2.md` bagian 4.

## Kriteria lolos (alur v2, 120 pertanyaan)

| Kriteria | Ambang | Hasil | Status |
|---|---|---|---|
| Jawaban generatif benar | ≥ 70% | 63/90 = 70,0% | lolos (tepat di ambang) |
| Lebih baik dari kutipan langsung | > kutipan | 63/90 lawan 48/90 | lolos |
| Pertanyaan tanpa dasar dijawab keliru | ≤ 10% | 0/30 | lolos |
| Sitasi semua sah (jawaban generatif atas pertanyaan terjawab) | ≥ 90% | 62/70 = 88,6% | **gagal** |
| Kalimat tanpa sitasi yang ditampilkan | 0 | 0 | lolos |

## Perbandingan pada pertanyaan yang sama

| Metrik (penilaian v2) | Alur v1 | Alur v2 | Kutipan langsung |
|---|---|---|---|
| Benar, dari 90 terjawab | 56 (62,2%) | 63 (70,0%) | 48 (53,3%) |
| Dijawab, dari 90 terjawab (cakupan) | 65 | 70 | 75 |
| Benar di antara yang dijawab | 56/65 (86,2%) | 63/70 (90,0%) | 48/75 (64,0%) |
| Tanpa dasar: ditolak | 28/30 | 28/30 | 20/30 |
| Tanpa dasar: koreksi premis sah | 2/30 | 2/30 | tidak berlaku |
| Tanpa dasar: keliru | 0/30 | 0/30 | 10/30 dijawab |
| Sitasi ada yang sah | 62/65 | 67/70 | tidak berlaku |
| Sitasi semua sah | 56/65 (86,2%) | 62/70 (88,6%) | tidak berlaku |
| Kalimat didukung NLI | 75/100 | 76/100 | tidak berlaku |
| Penilaian v1 (pembanding lama), benar | 55/90 | 62/90 | 48/90 |

Mode alur v2: 72 generatif, 31 ditolak gerbang, 17 ditolak model. Alur v1: 67, 35, dan 18.

## Analisis sensitivitas (ditetapkan sebelum run)

Tanpa h023, h066, dan h072, yang teksnya identik dengan set lain, ada 117 pertanyaan (89 terjawab, 28 tanpa dasar).

| Metrik | Alur v1 | Alur v2 | Kutipan langsung |
|---|---|---|---|
| Benar | 55/89 (61,8%) | 62/89 (69,7%) | 48/89 (53,9%) |
| Tanpa dasar keliru | 0/28 | 0/28 | 10/28 dijawab |
| Sitasi semua sah | 55/64 (85,9%) | 61/69 (88,4%) | tidak berlaku |

Kesimpulannya tidak berubah. Pada 117 pertanyaan, jawaban benar alur v2 sedikit di bawah 70%. Angka utama tetap 120 pertanyaan sesuai protokol.

## Komponen alur v2 (pengamatan, bukan untuk penyetelan)

- **Gerbang reranker** mengubah 4 pertanyaan. Dua pertanyaan terjawab menjadi benar, dan dua pertanyaan tanpa dasar tetap tidak keliru.
- **Ringkasan ayat** mengubah 29 pertanyaan. Jawaban benar naik dari 14 menjadi 19 dari 25 pertanyaan terjawab, tetapi kalimat yang didukung NLI hanya 17/27. Karena itu komponen ini tidak memenuhi aturan keputusan dev (dukungan ≥ 80%) pada set ini.
- **Kutipan cadangan** tidak mengubah pertanyaan apa pun.
- Hasil berubah pada 9 pertanyaan: 8 dari salah menjadi benar, 1 dari benar menjadi salah.

## Sitasi yang gagal

Delapan jawaban generatif memuat paling sedikit satu sitasi di luar label emas: h031, h046, h078, h095, h101, h104, h117, dan h119. Lima di antaranya tetap dinilai benar. Polanya sama dengan dev: model menambah kalimat yang mengutip pasal terkait. Aturan dan label tidak diubah.

## Batasan

- Revisi internal model Workers AI tidak dapat dikunci.
- Pertanyaan ditulis agen AI, bukan ahli K3.
- Satu angka holdout terlihat sebelum run (85/120 lolos gerbang v1), dan tidak dipakai untuk apa pun.
- Set ini sudah terpakai. Evaluasi generalisasi berikutnya butuh set baru; set ini tidak akan dipakai untuk menyetel lalu diklaim independen lagi.
