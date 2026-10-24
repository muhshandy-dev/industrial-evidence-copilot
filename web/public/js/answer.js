// Jawaban ekstraktif. Identik dengan src/evidence/answer.py (paritas diuji).
// Tidak ada model bahasa generatif: setiap kalimat adalah salinan persis dari satu ayat atau butir.
import { tokenize } from "./text.js";

const UNIT_START = /^(\(\d+[a-z]?\)|\d+\.)\s+/;
export const MAX_UNITS = 2;
export const SECOND_RATIO = 0.8;

export function splitUnits(text) {
  const units = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (UNIT_START.test(line) || units.length === 0) units.push([line]);
    else units[units.length - 1].push(line);
  }
  return units.map((u) => u.join(" "));
}

export function coverage(queryTerms, textTerms, idf, oovIdf) {
  const uniq = [...new Set(queryTerms)];
  const weight = (t) => idf[t] ?? oovIdf;
  const total = uniq.reduce((s, t) => s + weight(t), 0);
  if (total === 0) return 0;
  return uniq.filter((t) => textTerms.has(t)).reduce((s, t) => s + weight(t), 0) / total;
}

// idf: peta istilah -> idf BM25. rankedChunks: indeks chunk dari peringkat tertinggi.
export function extractAnswer(query, rankedChunks, chunkTexts, idf, { topChunks = 3, threshold = 0.5, useStem = true } = {}) {
  const qTerms = tokenize(query, { useStem });
  const idfValues = Object.values(idf);
  const oov = idfValues.length ? Math.max(...idfValues) : 1;
  const cand = [];
  let bestCov = 0;
  rankedChunks.slice(0, topChunks).forEach((ci, rank) => {
    const whole = new Set(tokenize(chunkTexts[ci], { useStem }));
    if (rank === 0) bestCov = coverage(qTerms, whole, idf, oov);
    splitUnits(chunkTexts[ci]).forEach((unit, ui) => {
      const score = coverage(qTerms, new Set(tokenize(unit, { useStem })), idf, oov);
      if (score > 0) cand.push({ chunk: ci, unit: ui, text: unit, score });
    });
  });
  if (bestCov < threshold || cand.length === 0) return { abstain: true, coverage: bestCov, evidence: [] };
  const order = new Map(rankedChunks.slice(0, topChunks).map((c, r) => [c, r]));
  cand.sort((a, b) => b.score - a.score || order.get(a.chunk) - order.get(b.chunk) || a.unit - b.unit);
  const picked = [cand[0]];
  for (const e of cand.slice(1)) {
    if (picked.length >= MAX_UNITS) break;
    if (e.score >= SECOND_RATIO * cand[0].score) picked.push(e);
  }
  return { abstain: false, coverage: bestCov, evidence: picked };
}
