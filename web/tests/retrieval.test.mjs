import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Retriever } from "../public/js/retrieval.js";
import { extractAnswer } from "../public/js/answer.js";

const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/parity.json", import.meta.url)));
const r = new Retriever(fx.index);
const idf = Object.fromEntries(Object.entries(fx.index.bm25).map(([t, v]) => [t, v[0]]));

test("skor dan urutan identik dengan Python (BM25, LSA, hybrid)", () => {
  for (const e of fx.expected) {
    for (const method of ["bm25", "lsa", "hybrid"]) {
      const s = r.scores(e.query, method);
      e[method].scores.forEach((v, i) => assert.ok(Math.abs(s[i] - v) < 1e-5, `${method} "${e.query}" #${i}: ${s[i]} vs ${v}`));
      const order = r.search(e.query, method, fx.chunks.length);
      // Urutan boleh berbeda hanya untuk skor yang praktis sama.
      order.forEach((d, i) => {
        const want = e[method].order[i];
        assert.ok(d === want || Math.abs(s[d] - s[want]) < 1e-5, `${method} "${e.query}" peringkat ${i}`);
      });
    }
  }
});

test("jawaban ekstraktif identik dengan Python", () => {
  for (const e of fx.expected) {
    const ranked = r.search(e.query, "hybrid", fx.chunks.length);
    const a = extractAnswer(e.query, ranked, fx.chunks, idf, { threshold: 0.5 });
    assert.equal(a.abstain, e.answer.abstain, e.query);
    assert.ok(Math.abs(a.coverage - e.answer.coverage) < 1e-5, e.query);
    assert.deepEqual(a.evidence.map((x) => [x.chunk, x.unit, x.text]), e.answer.evidence, e.query);
  }
});

test("pertanyaan di luar cakupan ditolak", () => {
  const ranked = r.search("resep nasi goreng", "hybrid", 3);
  assert.equal(extractAnswer("resep nasi goreng", ranked, fx.chunks, idf).abstain, true);
});
