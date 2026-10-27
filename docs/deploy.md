# Deploy ke Cloudflare Pages

Situs statis ditambah satu Pages Function (`/api/jawab`) untuk mode generatif server. Tidak ada langkah build.

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
2. Akun tetap di paket Workers Free ($0). Kuota harian gratis (10.000 neuron, pulih 00.00 UTC atau
   07.00 WIB) yang habis berakhir dengan galat 4006, bukan tagihan. Fungsi mengubahnya menjadi
   `429 kuota_habis`, dan situs kembali ke kutipan langsung.

Tidak ada secret dan tidak ada API token Cloudflare. Model yang dipakai situs ditetapkan di kode
(`MODEL_SERVER` dan `VARIAN_SERVER` di `web/public/js/gen/prompt.js`); bila `MODEL_SERVER` bernilai
`null`, `GET /api/jawab` memberi `{"aktif": false}` dan mode server tidak ditawarkan.

### Perlindungan `/api/jawab`

| Jalur | Syarat | Bila gagal |
| --- | --- | --- |
| Pengunjung | header `Origin` sama dengan asal situs | `403 asal_ditolak` |
| Pengunjung | paling banyak 6 permintaan per menit per IP (per isolate, upaya terbaik) | `429 terlalu_sering` |
| Pengunjung | tidak boleh memilih model atau varian prompt | `403 pilihan_model_butuh_evaluasi` |
| Semua | badan paling besar 4 KB, pertanyaan 3 sampai 500 karakter, 1 sampai 4 id pasal yang dikenal | `400` atau `413` |
| Evaluasi | hanya di deploy Preview, bukan domain produksi | `403 evaluasi_hanya_preview` |
| Evaluasi | token OIDC GitHub Actions: tanda tangan RS256 dari JWKS GitHub, `aud` khusus, repositori ini, dan workflow `eksperimen-server.yml`, `tersegel.yml`, atau `holdout-v2.yml` | `401 evaluasi_ditolak` |

Fungsi menyusun prompt sendiri dari korpus situs; peramban hanya mengirim pertanyaan dan nomor
pasal. Jadi kuota tidak bisa dipakai untuk prompt bebas. Pengujian fungsi ada di
`web/tests/fungsi.test.mjs` (termasuk OIDC dengan kunci RSA lokal) dan
`web/tests/preview-server.mjs` (deploy Preview sungguhan, dijalankan workflow "Peramban generatif").

### Evaluasi model server

Workflow `eksperimen-server.yml` (dev, test, uji tekanan, injeksi) dan `tersegel.yml` (set
tersegel, sekali jalan) meminta token OIDC dari GitHub (`permissions: id-token: write`) lalu
memanggil `/api/jawab` di alamat Preview cabang. Keluaran, jumlah token, dan sidik prompt
di-commit ke `eval/cache/gen/`. Bila kuota habis di tengah jalan, workflow berhenti, menyimpan
yang sudah selesai, dan dapat dilanjutkan setelah kuota pulih.

### Mengaktifkan Production

Production hanya dideploy setelah pemilik proyek menyetujui hasil evaluasi akhir. Langkahnya:
pastikan binding `AI` terpasang untuk Production, gabungkan PR ke `main`, lalu jalankan
`tools/verify_published.py` atau workflow "Periksa situs terbit".

## Header

`web/public/_headers` mengatur CSP ketat (`default-src 'none'`, gaya hanya dari `'self'`, tanpa skrip sebaris). Permintaan ke pihak ketiga hanya terjadi bila pengunjung memilih mode generatif: pustaka transformers.js dari jsDelivr dan bobot reranker atau model lokal dari Hugging Face. Header keamanan lain dan cache: HTML, CSS, dan JS selalu divalidasi ulang; font di-cache 30 hari; data 5 menit.

## Mengapa tanpa idle sleep

Cloudflare Pages menyajikan berkas statis dari jaringan tepi, dan pencarian berjalan di peramban pengunjung. Pages Function dan Workers AI dijalankan per permintaan oleh Cloudflare, tanpa proses yang harus tetap hidup, jadi tidak ada kondisi "tidur" yang perlu dibangunkan.

## Memeriksa setelah deploy

```
python tools/verify_published.py https://industrial-evidence-copilot.pages.dev/
```

Atau jalankan workflow manual "Periksa situs terbit" di GitHub Actions. Skrip memeriksa status, header keamanan, dan bahwa tiga berkas data yang disajikan identik dengan repositori. Pemeriksaan tampilan di peramban (ruang kerja, evaluasi, cara kerja, tema terang dan gelap) tetap dilakukan manual oleh pemilik proyek.

> Status saat ini: situs **belum terverifikasi live**. Sesi pengembangan tidak dapat membuka `pages.dev`.
