// Pencarian di browser: BM25, LSA, dan penggabungan RRF. Rumusnya identik dengan
// src/evidence/{bm25,lsa,fusion,retriever}.py; paritas diuji di tests/retrieval.test.mjs.
import { tokenize } from "./text.js";

export function rankOrder(scores) {
  // Skor sama diurutkan menurut indeks naik, sama seperti numpy.lexsort di Python.
  return Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a] || a - b);
}

export function rrf(scoreLists, k = 60) {
  const out = new Float64Array(scoreLists[0].length);
  for (const s of scoreLists) {
    const order = rankOrder(s);
    order.forEach((doc, i) => { out[doc] += 1 / (k + i + 1); });
  }
  return out;
}

export class Retriever {
  constructor(index) {
    this.index = index;
    this.n = index.n;
    const lsa = index.lsa;
    this.lsaIndex = new Map(lsa.kosakata.map((t, i) => [t, i]));
    this.dim = lsa.dim;
  }

  queryTokens(query) {
    return tokenize(query, { useStem: this.index.pakai_stem });
  }

  bm25(tokens) {
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
        out[d] += (idf * tf * (k1 + 1)) / (tf + k1 * norm);
      }
    }
    return out;
  }

  queryVector(tokens) {
    const { lsa } = this.index;
    const counts = new Map();
    for (const t of tokens) {
      const j = this.lsaIndex.get(t);
      if (j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1);
    }
    const weights = [];
    let norm = 0;
    for (const [j, tf] of counts) {
      const w = (1 + Math.log(tf)) * lsa.idf[j];
      weights.push([j, w]);
      norm += w * w;
    }
    const vec = new Float64Array(this.dim);
    if (norm === 0) return vec;
    norm = Math.sqrt(norm);
    for (const [j, w] of weights) {
      const base = j * this.dim;
      for (let k = 0; k < this.dim; k++) vec[k] += (w / norm) * lsa.komponen[base + k];
    }
    let vn = 0;
    for (let k = 0; k < this.dim; k++) vn += vec[k] * vec[k];
    vn = Math.sqrt(vn) || 1;
    for (let k = 0; k < this.dim; k++) vec[k] /= vn;
    return vec;
  }

  lsa(tokens) {
    const q = this.queryVector(tokens);
    const { vektor_dokumen: dv } = this.index.lsa;
    const out = new Float64Array(this.n);
    for (let d = 0; d < this.n; d++) {
      let s = 0;
      const base = d * this.dim;
      for (let k = 0; k < this.dim; k++) s += dv[base + k] * q[k];
      out[d] = s;
    }
    return out;
  }

  scores(query, method = "hybrid") {
    const tokens = this.queryTokens(query);
    if (method === "bm25") return this.bm25(tokens);
    if (method === "lsa") return this.lsa(tokens);
    return rrf([this.bm25(tokens), this.lsa(tokens)], this.index.rrf_k);
  }

  search(query, method = "hybrid", k = 10) {
    return rankOrder(this.scores(query, method)).slice(0, k);
  }
}
