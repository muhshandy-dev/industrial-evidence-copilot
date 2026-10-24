import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Retriever, rankOrder } from "../public/js/retrieval.js";
import { extractAnswer } from "../public/js/answer.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const korpus = read("../public/data/korpus.json");
const indeks = read("../public/data/indeks.json");
const ev = read("../public/data/evaluasi.json");
const questions = readFileSync(new URL("../../eval/questions.jsonl", import.meta.url), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("data website berasal dari korpus nyata dan hasil evaluasi yang sama", () => {
  assert.equal(korpus.asal, "nyata");
  assert.equal(korpus.chunk.length, ev.korpus.pasal);
  assert.equal(korpus.dokumen.length, ev.korpus.dokumen);
  assert.equal(indeks.n, korpus.chunk.length);
});

test("seluruh pertanyaan evaluasi: peringkat 1, penolakan, dan kutipan identik dengan Python", () => {
  const r = new Retriever(indeks);
  const idf = Object.fromEntries(Object.entries(indeks.bm25).map(([t, v]) => [t, v[0]]));
  const texts = korpus.chunk.map((c) => c.teks_cari || c.teks);
  const shown = korpus.chunk.map((c) => c.teks);
  const byId = new Map(ev.per_pertanyaan.map((x) => [x.id, x]));
  assert.equal(byId.size, questions.length);
  let compared = 0;
  for (const q of questions) {
    const want = byId.get(q.id);
    const s = r.scores(r.queryTokens(q.tanya));
    const ranked = rankOrder(s);
    const a = extractAnswer(q.tanya, ranked, texts, idf, { topScore: s[ranked[0]], threshold: ev.ambang_jawab, displayTexts: shown });
    assert.equal(korpus.chunk[ranked[0]].id, want.top1, `${q.id} peringkat 1`);
    assert.equal(a.abstain, want.menolak, `${q.id} penolakan`);
    assert.deepEqual(a.evidence.map((e) => korpus.chunk[e.chunk].id), want.sitasi, `${q.id} sitasi`);
    assert.deepEqual(a.evidence.map((e) => e.unit), want.unit, `${q.id} unit`);
    compared++;
  }
  assert.equal(compared, 221);
});
