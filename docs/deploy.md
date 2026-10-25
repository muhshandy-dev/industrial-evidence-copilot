# Deploy ke Cloudflare Pages

Situs sepenuhnya statis. Tidak ada langkah build.

## Pengaturan proyek di Cloudflare Pages

| Pengaturan | Nilai |
| --- | --- |
| Sambungkan ke | repositori GitHub `industrial-evidence-copilot`, cabang `main` |
| Framework preset | None |
| Build command | kosong (atau `cd web && npm ci && npm run build` untuk menjalankan pemeriksaan sebelum deploy) |
| Build output directory | `web/public` |
| Nama proyek | `industrial-evidence-copilot` (tanpa kode atau awalan) |

Data situs (`web/public/data/*.json`) ikut di repositori, jadi Cloudflare tidak perlu menjalankan Python.

## Mode generatif lewat Workers AI

`functions/api/jawab.js` adalah Pages Function yang dibangun otomatis oleh Cloudflare Pages (folder
`functions/` di akar repositori). Ia butuh binding Workers AI:

1. Proyek Pages > Settings > Bindings > Add > Workers AI, nama variabel `AI`, untuk Production dan
   Preview.
2. Akun tetap di paket Workers Free, supaya kuota harian (10.000 neuron) yang habis berakhir dengan
   galat, bukan tagihan. Situs lalu kembali ke kutipan langsung.

Fungsi ini nonaktif selama `MODEL_SERVER` di `web/public/js/gen/prompt.js` bernilai `null`
(`GET /api/jawab` memberi `{"aktif": false}`). Evaluasi memakai REST API Workers AI dari GitHub
Actions dengan secret `CLOUDFLARE_ACCOUNT_ID` dan `CLOUDFLARE_API_TOKEN` (template token "Workers AI").

## Header

`web/public/_headers` mengatur CSP ketat (`default-src 'none'`, skrip dan gaya hanya dari `'self'`, tanpa permintaan keluar), header keamanan lain, dan cache: HTML, CSS, dan JS selalu divalidasi ulang; font di-cache 30 hari; data 5 menit.

## Mengapa tanpa idle sleep

Tidak ada proses server. Cloudflare Pages menyajikan berkas statis dari jaringan tepi, dan pencarian berjalan di peramban pengunjung. Tidak ada kondisi "tidur" yang bisa terjadi.

## Memeriksa setelah deploy

```
python tools/verify_published.py https://industrial-evidence-copilot.pages.dev/
```

Atau jalankan workflow manual "Periksa situs terbit" di GitHub Actions. Skrip memeriksa status, header keamanan, dan bahwa tiga berkas data yang disajikan identik dengan repositori. Pemeriksaan tampilan di peramban (ruang kerja, evaluasi, cara kerja, tema terang dan gelap) tetap dilakukan manual oleh pemilik proyek.

> Status saat ini: situs **belum terverifikasi live**. Sesi pengembangan tidak dapat membuka `pages.dev`.
