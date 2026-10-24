import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Retriever, rankOrder } from "../public/js/retrieval.js";
import { extractAnswer } from "../public/js/answer.js";

const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/parity.json", import.meta.url)));
const r = new Retriever(fx.index);
const idf = Object.fromEntries(Object.entries(fx.index.bm25).map(([t, v]) => [t, v[0]]));

test("skor dan urutan BM25 identik dengan Python", () => {
  for (const e of fx.expected) {
    const s = r.scores(r.queryTokens(e.query));
    e.bm25.scores.forEach((v, i) => assert.ok(Math.abs(s[i] - v) < 1e-5, `"${e.query}" #${i}: ${s[i]} vs ${v}`));
    const order = rankOrder(s);
    // Urutan boleh berbeda hanya untuk skor yang praktis sama.
    order.forEach((d, i) => {
      const want = e.bm25.order[i];
      assert.ok(d === want || Math.abs(s[d] - s[want]) < 1e-5, `"${e.query}" peringkat ${i}`);
    });
  }
});

test("jawaban ekstraktif identik dengan Python", () => {
  for (const e of fx.expected) {
    const s = r.scores(r.queryTokens(e.query));
    const ranked = rankOrder(s);
    const a = extractAnswer(e.query, ranked, fx.chunks, idf, { topScore: s[ranked[0]], threshold: fx.threshold });
    assert.equal(a.abstain, e.answer.abstain, e.query);
    assert.ok(Math.abs(a.score - e.answer.score) < 1e-5, e.query);
    assert.ok(Math.abs(a.coverage - e.answer.coverage) < 1e-5, e.query);
    assert.deepEqual(a.evidence.map((x) => [x.chunk, x.unit, x.text]), e.answer.evidence, e.query);
  }
});

test("pertanyaan di luar cakupan ditolak", () => {
  const s = r.scores(r.queryTokens("resep nasi goreng"));
  const a = extractAnswer("resep nasi goreng", rankOrder(s), fx.chunks, idf, { topScore: Math.max(...s), threshold: fx.threshold });
  assert.equal(a.abstain, true);
});

test("penjelasan kontribusi istilah menjumlah ke skor BM25", () => {
  const q = "berapa kali bejana tekan diperiksa";
  const tokens = r.queryTokens(q);
  const s = r.scores(tokens);
  const top = rankOrder(s)[0];
  const sum = r.explain(tokens, top).reduce((a, x) => a + x.part, 0);
  assert.ok(Math.abs(sum - s[top]) < 1e-9);
});
