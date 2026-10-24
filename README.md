# Industrial Evidence Copilot

Tanya jawab atas 15 peraturan keselamatan dan kesehatan kerja (K3) Indonesia. Setiap jawaban berupa kutipan langsung dari pasal sumbernya, lengkap dengan nomor pasal yang bisa dibuka dan diperiksa. Bila skor pencarian terlalu rendah, sistem menolak menjawab.

**Ini bukan AI generatif.** Tidak ada model bahasa yang menulis jawaban. Sistem mencari pasal dengan BM25, lalu menyalin ayat atau butir dari pasal peringkat 1. Semua berjalan di peramban pengunjung: tanpa server, tanpa API berbayar, tanpa idle sleep.

- Situs: https://industrial-evidence-copilot.pages.dev/ (belum diverifikasi live)
- Halaman: Ruang kerja (sumber, tanya jawab, pembaca bukti), Evaluasi, Cara kerja dan batas

## Hasil (data uji)

| Ukuran | Nilai | Interval 95% |
| --- | --- | --- |
| Pasal tepat di peringkat 1 | 68% | 58–77% |
| Pasal tepat di lima teratas | 90% | 83–96% |
| Jawaban yang mengutip pasal salah | 23 dari 81 (28%) | 20–39% |
| Jawaban benar (pasal tepat dan fakta kunci ada) | 58% | 48–68% |
| Pertanyaan tanpa dasar yang dijawab | 0 dari 21 | batas atas 15% |
| Uji tekanan: pertanyaan panjang di luar korpus yang dijawab | 7 dari 12 | ilustrasi |

Angka ini **optimistis**: 221 pertanyaan ditulis oleh asisten AI pengembang (bukan praktisi K3), dan data uji sudah dilihat sebelum desain akhir. Protokol lengkap, pengungkapan, dan batasnya: [docs/evaluasi.md](docs/evaluasi.md). Audit independen dan tindak lanjutnya: [docs/audit-evaluasi.md](docs/audit-evaluasi.md).

## Data dan lisensi

15 peraturan dari JDIH Kementerian Ketenagakerjaan, 622 pasal, setiap PDF dicatat dengan SHA-256. Enam peraturan lain dikeluarkan karena berupa pindaian yang tidak layak dikutip. Peraturan perundang-undangan bukan objek hak cipta menurut Pasal 42 huruf b UU 28/2014; rujukan ini baru terverifikasi dari sumber sekunder dan perlu dicek manual. Bukan nasihat hukum. Lihat [docs/kartu-data.md](docs/kartu-data.md).

Kode: MIT. Font: lisensi masing-masing di `web/public/fonts/`.

## Cara kerja

PDF resmi → teks per pasal → BM25 dengan stemmer Indonesia dan konteks judul/bab → gerbang skor (ambang 14,0 dari dev) → kutipan ayat atau butir dari pasal peringkat 1. LSA dan hibrida BM25 + LSA diuji dan tidak lebih baik; embedding pra-latih belum diuji. Lihat [docs/kartu-metode.md](docs/kartu-metode.md) dan [docs/arsitektur.md](docs/arsitektur.md).

## Menjalankan

```
pip install -e ".[dev]"
evidence eval-set check   # validasi pertanyaan dan label test yang dibekukan
evidence eval             # hitung ulang eval/results.json (deterministik)
evidence export           # data situs di web/public/data
pytest

cd web && npm ci
npm test && npm run build
npx playwright install chromium && npm run e2e
node tests/serve.mjs      # http://127.0.0.1:8788
```

Mengunduh ulang PDF dan membangun korpus dari nol: [docs/reproduksi.md](docs/reproduksi.md). Deploy: [docs/deploy.md](docs/deploy.md) (Cloudflare Pages, output `web/public`, tanpa build).

## Struktur

```
corpus/      manifest sumber dan korpus per pasal
eval/        pertanyaan beku, uji tekanan, hasil evaluasi
src/evidence pipeline Python (ingest, BM25, jawaban, evaluasi, ekspor)
web/public   situs statis (HTML, CSS, JS modul, data)
docs/        kartu data, kartu metode, evaluasi, audit, arsitektur, reproduksi, deploy
tools/       fixture paritas, pemeriksa situs terbit
```
