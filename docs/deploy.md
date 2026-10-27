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
| Pengunjung | bukan domain produksi (status RAG Research Prototype, `web/public/js/situs.js`) | `503 prototipe_riset_tidak_aktif_di_produksi`, tanpa memanggil Workers AI |
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

### Production (status akhir)

Proyek ditutup sebagai RAG Research Prototype setelah holdout v2 gagal pada kriteria sitasi
(`docs/holdout-v2-hasil.md`). Production (`main`, domain `industrial-evidence-copilot.pages.dev`)
hanya menjalankan kutipan langsung: panel tidak menawarkan mode generatif dan `/api/jawab` menolak
pengunjung dengan 503 tanpa memanggil model, walaupun binding `AI` terpasang. Mode generatif tetap
berjalan di deploy Preview untuk riset. Mengaktifkannya di Production butuh evaluasi baru pada set
baru dan persetujuan pemilik proyek, lalu perubahan `generatifDiizinkan` di `situs.js`.

Setelah deploy, jalankan `tools/verify_published.py` atau workflow "Periksa situs terbit" untuk
memastikan berkas yang terbit sama dengan repo.
