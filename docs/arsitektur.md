# Arsitektur

```
JDIH PDF ──fetch──▶ data/raw (SHA-256) ──build──▶ corpus/korpus.json
                                                     │
eval/draft/*.jsonl ─eval-set build─▶ eval/questions.jsonl (beku)
                                                     │
                       evidence eval ◀───────────────┘
                              │
                      eval/results.json
                              │
                       evidence export
                              ▼
        web/public/data/{korpus,indeks,evaluasi}.json
                              │
           Cloudflare Pages (statis + Pages Function)
                              ▼
        Peramban: BM25 → gerbang skor ─┬─▶ kutipan ayat/butir (bawaan, cadangan)
                                       └─▶ reranker mMiniLM → 4 pasal
                                              ├─▶ /api/jawab → Workers AI (Llama 3.3 70B, utama)
                                              └─▶ Qwen2.5 di perangkat (opsional)
                                                     ▼
                                          periksa sitasi → jawaban bersitasi
```

## Modul Python (`src/evidence`)

| Modul | Tugas |
| --- | --- |
| `ingest.py`, `corpus.py` | PDF ke pasal, manifest, SHA-256, format korpus |
| `text.py` | tokenisasi, stemmer ringan, penyamaan ejaan lama |
| `bm25.py`, `lsa.py`, `fusion.py`, `retriever.py` | metode pencarian; LSA dan RRF hanya untuk ablasi offline |
| `answer.py` | gerbang penolakan dan ekstraksi ayat atau butir |
| `evalset.py` | pembekuan split, validasi pertanyaan, kunci fakta |
| `evalrag.py`, `metrics.py` | evaluasi pencarian dan jawaban, interval kepercayaan, bootstrap |
| `dense.py`, `rerank.py` | e5 dan reranker (skor dihitung di GitHub Actions, disimpan di `eval/cache/`) |
| `generation.py` | masukan generator, penilaian jawaban generatif (sitasi, NLI), aturan pemilihan prompt dan model |
| `sealed.py` | set uji tersegel, sekali jalan |
| `export_web.py`, `cli.py` | data situs dan perintah `evidence` |

## Server (`functions/`, `server/`)

`functions/api/jawab.js` menerima pertanyaan dan nomor pasal, menyusun prompt dari korpus situs dengan kode `prompt.js` yang sama, lalu memanggil Workers AI. `server/oidc.js` memverifikasi token OIDC GitHub Actions untuk jalur evaluasi. Perlindungan lengkap: `docs/deploy.md`.

## Situs (`web/public`)

JavaScript modul ES tanpa kerangka kerja dan tanpa build. `retrieval.js` dan `answer.js` adalah port dari `bm25.py` dan `answer.py`; paritasnya diuji. `gen/` berisi mode generatif: `prompt.js` (prompt, pembacaan sitasi, pemeriksaan; dipakai juga oleh fungsi server dan evaluasi), `rerank.js`, `runtime.js` (memuat transformers.js dan model, memanggil `/api/jawab`), dan `panel.js` (pilihan mode). Semua elemen dibuat lewat `dom.js` (`textContent`, tidak pernah `innerHTML`), sehingga CSP tanpa `unsafe-inline` dapat diterapkan.

Tiga halaman: Ruang kerja (sumber, tanya jawab, pembaca bukti), Evaluasi, dan Cara kerja dan batas. Animasi bersifat fungsional (urutan pencarian, sorotan bukti) dan mati bila pengguna meminta gerak dikurangi.

## Keputusan desain yang penting

- **Generatif dengan sitasi wajib, kutipan langsung sebagai cadangan.** Kalimat tanpa sitasi sah dibuang; bila tidak ada yang tersisa, situs menampilkan kutipan asli. Lihat `docs/kartu-metode.md`.
- **Gerbang memakai skor BM25, bukan kecocokan kata.** Dipilih dari analisis dev: skor BM25 lebih baik memisahkan pertanyaan terjawab dari tak terjawab.
- **Kutipan langsung hanya dari pasal peringkat 1.** Sitasi selalu sama dengan hasil pencarian yang bisa dilihat pengguna.
- **Prompt disusun di server dari nomor pasal.** Kuota gratis tidak bisa dipakai untuk prompt bebas.
- **Statis plus fungsi per permintaan.** Tanpa server yang tidur, tanpa biaya (Workers Free).
