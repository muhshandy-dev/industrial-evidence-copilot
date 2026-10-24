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
                  Cloudflare Pages (statis)
                              ▼
        Peramban: BM25 → gerbang skor → kutipan ayat/butir
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
| `export_web.py`, `cli.py` | data situs dan perintah `evidence` |

## Situs (`web/public`)

JavaScript modul ES tanpa kerangka kerja dan tanpa build. `retrieval.js` dan `answer.js` adalah port dari `bm25.py` dan `answer.py`; paritasnya diuji. Semua elemen dibuat lewat `dom.js` (`textContent`, tidak pernah `innerHTML`), sehingga CSP tanpa `unsafe-inline` dapat diterapkan.

Tiga halaman: Ruang kerja (sumber, tanya jawab, pembaca bukti), Evaluasi, dan Cara kerja dan batas. Animasi bersifat fungsional (urutan pencarian, sorotan bukti) dan mati bila pengguna meminta gerak dikurangi.

## Keputusan desain yang penting

- **Ekstraktif, bukan generatif.** Supaya kutipan dapat diperiksa dan tidak ada kalimat karangan. Lihat `docs/kartu-metode.md`.
- **Gerbang memakai skor BM25, bukan kecocokan kata.** Dipilih dari analisis dev: skor BM25 lebih baik memisahkan pertanyaan terjawab dari tak terjawab.
- **Kutipan hanya dari pasal peringkat 1.** Sitasi selalu sama dengan hasil pencarian yang bisa dilihat pengguna.
- **Statis di peramban.** Tanpa server, tanpa biaya, tanpa idle sleep.
