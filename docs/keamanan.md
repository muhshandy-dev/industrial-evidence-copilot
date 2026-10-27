# Pemeriksaan keamanan

Pemeriksaan akhir, 27 Oktober 2026, pada cabang yang digabung ke `main`.

| Area | Yang diperiksa | Hasil |
|---|---|---|
| Dependensi JavaScript | `npm audit` (semua dependensi, termasuk dev) di `web/` | 0 kerentanan |
| Dependensi Python | `pip-audit` pada lingkungan `.[dev]` | tidak ada kerentanan yang diketahui |
| Secret di repositori | pencarian pola kunci API, token GitHub, kunci privat, dan riwayat `CLOUDFLARE_API_TOKEN` | tidak ada; workflow tidak memakai secret Cloudflare |
| Header situs | `web/public/_headers`: CSP `default-src 'none'` tanpa skrip atau gaya sebaris, `frame-ancestors 'none'`, HSTS, `nosniff`, COOP, CORP, Permissions-Policy | diterapkan juga di server uji, jadi e2e ikut menguji CSP |
| Endpoint `/api/jawab` | domain produksi menolak pengunjung (503, tanpa panggilan model); Origin wajib; 6 permintaan per menit per IP; badan maksimal 4 KB; prompt disusun server dari korpus; pilihan model hanya untuk evaluasi dengan token OIDC GitHub Actions dari tiga workflow repositori ini dan hanya di Preview | diuji di `web/tests/fungsi.test.mjs` |
| Prompt injection | 20 pertanyaan injeksi, tinjauan manual: 11 dari 11 jawaban tampil aman; teks pasal dan pertanyaan dibungkus sebagai data; tautan yang tidak ada di pasal dibuang | `docs/evaluasi.md` |
| Kode pihak ketiga di peramban | transformers.js dari jsDelivr dengan versi dipatok dan sidik SHA-256 diperiksa sebelum dijalankan; bobot model dari Hugging Face dengan revisi dipatok; hanya dimuat bila pengguna memilih mode generatif (tidak tersedia di domain produksi) | `web/public/js/gen/runtime.js` |
| Izin workflow | workflow yang menulis ke repo hanya dijalankan manual; `id-token: write` hanya pada job yang memanggil jalur evaluasi | `.github/workflows/` |
| Biaya | paket Workers Free: kuota habis menghasilkan galat, bukan tagihan | `docs/deploy.md` |

Risiko yang diterima:

- Batas per IP berlaku per isolate Cloudflare, jadi bukan batas global. Batas keras biaya tetap kuota gratis harian, dan di domain produksi model tidak dipanggil sama sekali.
- Deploy Preview tetap dapat memanggil Workers AI untuk riset. Alamatnya publik, tetapi tunduk pada Origin, batas per IP, dan kuota gratis.
