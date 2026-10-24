// Jawaban ekstraktif. Identik dengan src/evidence/answer.py (paritas diuji).
// Tidak ada model bahasa generatif: setiap kalimat adalah salinan persis dari satu ayat atau butir
// pada pasal peringkat 1.
import { tokenize } from "./text.js";

const UNIT_START = /^(\(\d+[a-z]?\)|\d+\.)\s+/;
export const MAX_UNITS = 3;
export const SECOND_RATIO = 0.6;

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

// idf: peta istilah -> idf BM25. rankedChunks: indeks pasal dari peringkat tertinggi.
// chunkTexts: teks untuk pencocokan (ejaan modern). displayTexts: teks asli untuk ditampilkan.
// topScore: skor BM25 pasal peringkat 1. threshold: ambang penolakan dalam satuan skor itu.
export function extractAnswer(query, rankedChunks, chunkTexts, idf, { topScore, threshold, useStem = true, displayTexts = null }) {
  if (rankedChunks.length === 0) return { abstain: true, score: topScore, coverage: 0, evidence: [] };
  const qTerms = tokenize(query, { useStem });
  const idfValues = Object.values(idf);
  const oov = idfValues.length ? Math.max(...idfValues) : 1;
  const ci = rankedChunks[0];
  const cov = coverage(qTerms, new Set(tokenize(chunkTexts[ci], { useStem })), idf, oov);
  if (topScore < threshold) return { abstain: true, score: topScore, coverage: cov, evidence: [] };
  const units = splitUnits(chunkTexts[ci]);
  let shown = displayTexts ? splitUnits(displayTexts[ci]) : units;
  if (shown.length !== units.length) shown = units;
  const cand = [];
  units.forEach((unit, ui) => {
    const score = coverage(qTerms, new Set(tokenize(unit, { useStem })), idf, oov);
    if (score > 0) cand.push({ chunk: ci, unit: ui, text: shown[ui], match: unit, score });
  });
  if (cand.length === 0) return { abstain: true, score: topScore, coverage: cov, evidence: [] };
  cand.sort((a, b) => b.score - a.score || a.unit - b.unit);
  const picked = [cand[0]];
  for (const e of cand.slice(1)) {
    if (picked.length >= MAX_UNITS) break;
    if (e.score >= SECOND_RATIO * cand[0].score) picked.push(e);
  }
  picked.sort((a, b) => a.unit - b.unit);
  return { abstain: false, score: topScore, coverage: cov, evidence: picked };
}
