// Pencarian di browser: BM25. Rumusnya identik dengan src/evidence/bm25.py; paritas diuji di
// tests/retrieval.test.mjs. Tidak ada model embedding di browser: LSA dan penggabungan RRF
// hanya ada di evaluasi offline karena terbukti tidak lebih baik dari BM25 (lihat halaman Evaluasi).
import { tokenize } from "./text.js";

export function rankOrder(scores) {
  // Skor sama diurutkan menurut indeks naik, sama seperti numpy.lexsort di Python.
  return Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a] || a - b);
}

export class Retriever {
  constructor(index) {
    this.index = index;
    this.n = index.n;
  }

  queryTokens(query) {
    return tokenize(query, { useStem: this.index.pakai_stem });
  }

  // Skor BM25 per pasal. contrib (opsional) menerima [istilah, indeks pasal, kontribusi].
  scores(tokens, contrib = null) {
    const { bm25, panjang_dokumen: len, rata_panjang: avg, k1, b } = this.index;
    const out = new Float64Array(this.n);
    for (const term of new Set(tokens)) {
      const entry = bm25[term];
      if (!entry) continue;
      const [idf, docs, tfs] = entry;
      for (let j = 0; j < docs.length; j++) {
        const d = docs[j];
        const tf = tfs[j];
        const norm = 1 - b + (b * len[d]) / avg;
        const part = (idf * tf * (k1 + 1)) / (tf + k1 * norm);
        out[d] += part;
        if (contrib) contrib(term, d, part);
      }
    }
    return out;
  }

  // Kontribusi tiap istilah pertanyaan pada satu pasal; untuk jejak pencarian yang bisa diperiksa.
  explain(tokens, doc) {
    const { bm25, panjang_dokumen: len, rata_panjang: avg, k1, b } = this.index;
    const rows = [];
    for (const term of new Set(tokens)) {
      const entry = bm25[term];
      if (!entry) { rows.push({ term, idf: null, tf: 0, part: 0 }); continue; }
      const [idf, docs, tfs] = entry;
      const j = docs.indexOf(doc);
      if (j < 0) { rows.push({ term, idf, tf: 0, part: 0 }); continue; }
      const tf = tfs[j];
      const norm = 1 - b + (b * len[doc]) / avg;
      rows.push({ term, idf, tf, part: (idf * tf * (k1 + 1)) / (tf + k1 * norm) });
    }
    return rows;
  }

  search(query, k = 10) {
    return rankOrder(this.scores(this.queryTokens(query))).slice(0, k);
  }
}
