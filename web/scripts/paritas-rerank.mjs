// Uji paritas reranker: skor transformers.js (bobot ONNX yang dipakai situs) dibandingkan dengan
// skor evaluasi (sentence-transformers, PyTorch) di eval/cache/rerank/mminilm/skor.json.
// Butuh unduhan model dari Hugging Face, jadi dijalankan di GitHub Actions.
//
//   node scripts/paritas-rerank.mjs [--n 15]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";
import * as lib from "@huggingface/transformers";
import { RERANKER, RERANKER_FP32, muatReranker, skorPasangan, teksPasal } from "../public/js/gen/rerank.js";

const { values: a } = parseArgs({ options: { n: { type: "string", default: "15" } } });
const akar = new URL("../../", import.meta.url);
const korpus = JSON.parse(readFileSync(new URL("web/public/data/korpus.json", akar)));
const cache = JSON.parse(readFileSync(new URL("eval/cache/rerank/mminilm/skor.json", akar)));
const indeks = new Map(korpus.chunk.map((c, i) => [c.id, i]));
const kunci = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
const tanya = readFileSync(new URL("eval/questions.jsonl", akar), "utf8").split("\n").filter(Boolean)
  .map((l) => JSON.parse(l).tanya).filter((t) => cache.skor[kunci(t)]).slice(0, Number(a.n));

const rr = await muatReranker(lib, "cpu", undefined, RERANKER_FP32);
let maks = 0;
let sama = 0;
for (const t of tanya) {
  const tabel = cache.skor[kunci(t)];
  const ids = Object.keys(tabel);
  const s = await skorPasangan(rr, t, ids.map((id) => teksPasal(korpus, indeks.get(id))));
  const beda = Math.max(...ids.map((id, i) => Math.abs(s[i] - tabel[id])));
  maks = Math.max(maks, beda);
  const top = (xs) => ids[xs.indexOf(Math.max(...xs))];
  const topSama = top(s) === top(ids.map((id) => tabel[id]));
  sama += topSama;
  console.log(`${beda.toFixed(4)} ${topSama ? "top sama " : "TOP BEDA "} ${ids.length} pasal  ${t.slice(0, 60)}`);
}
console.log(`${tanya.length} pertanyaan; selisih skor maksimum ${maks.toFixed(4)}; pasal teratas sama ${sama}/${tanya.length}`);
assert.ok(tanya.length >= 5, "terlalu sedikit pertanyaan yang ada di cache");
assert.ok(maks < 0.02, `skor reranker situs berbeda dari evaluasi (maks ${maks})`);
assert.equal(sama, tanya.length);
console.log("paritas reranker fp32 lolos");

// Reranker situs (8-bit): skornya harus sama dengan cache yang dipakai evaluasi.
if (RERANKER.kunci) {
  const c8 = JSON.parse(readFileSync(new URL(`eval/cache/rerank/${RERANKER.kunci}/skor.json`, akar)));
  assert.equal(c8.berkas, RERANKER.berkas);
  const r8 = await muatReranker(lib, "cpu", undefined, RERANKER);
  let m8 = 0;
  for (const t of tanya) {
    const tabel = c8.skor[kunci(t)];
    const ids = Object.keys(tabel);
    const s = await skorPasangan(r8, t, ids.map((id) => teksPasal(korpus, indeks.get(id))));
    m8 = Math.max(m8, ...ids.map((id, i) => Math.abs(s[i] - tabel[id])));
  }
  console.log(`8-bit: selisih skor maksimum terhadap cache evaluasi ${m8.toFixed(5)}`);
  assert.ok(m8 < 1e-3, `skor reranker 8-bit situs berbeda dari cache (maks ${m8})`);
  console.log("paritas reranker 8-bit lolos");
}
