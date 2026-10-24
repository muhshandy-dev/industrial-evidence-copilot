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
