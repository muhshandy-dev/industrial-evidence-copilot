# Mereproduksi hasil

Semua angka di situs dan di `docs/evaluasi.md` berasal dari `eval/results.json`. Berikut cara menghitung ulang.

## Prasyarat

Python 3.11 atau lebih baru, Node 22 (untuk situs), dan koneksi internet hanya bila ingin mengunduh ulang PDF.

```
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
```

## Tanpa mengunduh PDF

Korpus (`corpus/korpus.json`) dan pertanyaan beku (`eval/questions.jsonl`) sudah ada di repositori. Evaluasi dapat dihitung ulang dari keduanya dalam sekitar 15 detik:

```
evidence eval-set check     # validasi pertanyaan terhadap korpus
evidence eval               # tulis ulang eval/results.json
git diff eval/results.json  # hanya blok "lingkungan" (versi Python dan numpy) yang boleh berbeda
evidence export             # tulis ulang web/public/data
pytest                      # termasuk uji yang menghitung ulang dan membandingkan dengan results.json
```

Evaluasi deterministik: bootstrap memakai benih tetap, dan pembagian dev/test ditentukan oleh hash SHA-256 id pertanyaan, bukan acak.

## Dari PDF resmi

```
evidence data fetch    # unduh dari JDIH, tolak bila SHA-256 tidak cocok dengan corpus/manifest.json
evidence build         # corpus/korpus.json
```

Sudah diuji di runner GitHub Actions (ubuntu-latest, Python 3.12) pada 2026-10-24: semua PDF terunduh dari JDIH dengan SHA-256 yang cocok, dan `corpus/korpus.json` terbangun ulang identik byte demi byte. Ekstraksi PDF tetap bergantung pada versi pdfplumber. Bila hasil ekstraksi di mesin lain berbeda sedikit, `git diff corpus/korpus.json` akan menunjukkannya, dan hasil evaluasi perlu dihitung ulang. Workflow `sumber-resmi` di GitHub Actions memeriksa ini secara terjadwal dan tidak menggagalkan PR.

## Situs

```
cd web
npm ci
npm test                 # uji unit JS, termasuk paritas dengan Python pada data nyata
npm run build            # pemeriksaan sebelum deploy (data, CSP, tanpa skrip sebaris)
npx playwright install chromium
npm run e2e              # alur tanya jawab, tiga halaman, axe, ponsel, gerak dikurangi
node tests/serve.mjs     # server lokal dengan header yang sama seperti produksi
```

Di lingkungan yang sudah punya Chromium, `CHROMIUM_PATH=/jalur/ke/chromium npm run e2e`.

## Mengubah pertanyaan atau korpus

Pertanyaan beku. Menambah pertanyaan ke `eval/draft/` lalu `evidence eval-set build` mempertahankan split yang sudah ada. Setiap perubahan korpus atau pertanyaan mengubah SHA-256 yang dicatat di hasil, dan angka lama tidak lagi sebanding. Catat perubahan itu di `docs/evaluasi.md`.
