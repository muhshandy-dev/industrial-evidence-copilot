// Paritas reranker di Chromium sungguhan: skor reranker situs (bobot dan runtime WebAssembly yang
// dipakai pengunjung) dibandingkan dengan skor evaluasi (PyTorch fp32). Butuh unduhan dari
// jsDelivr dan Hugging Face, jadi dijalankan di GitHub Actions.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { startServer } from "./serve.mjs";

const akar = new URL("../../", import.meta.url);
const acuan = JSON.parse(readFileSync(new URL("eval/cache/rerank/mminilm/skor.json", akar))).skor;
const kunci = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
const tanya = [
  "Berapa usia paling rendah untuk menjadi operator forklift kelas II?",
  ...readFileSync(new URL("eval/questions.jsonl", akar), "utf8").split("\n").filter(Boolean)
    .map((l) => JSON.parse(l).tanya).filter((t) => acuan[kunci(t)]).slice(0, 4),
];

const server = await startServer(0);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector("main[data-ready]", { timeout: 30000 });
  const daftar = tanya.map((t) => ({ t, ids: Object.keys(acuan[kunci(t)]) }));
  const { skor, berkas } = await page.evaluate(async (daftar) => {
    const rt = await import("/js/gen/runtime.js");
    const rk = await import("/js/gen/rerank.js");
    const lib = await rt.muatPustaka();
    const berkas = new Set();
    const rr = await rk.muatReranker(lib, "wasm", (p) => berkas.add(p.file));
    const korpus = await (await fetch("/data/korpus.json")).json();
    const idx = new Map(korpus.chunk.map((c, i) => [c.id, i]));
    const skor = [];
    for (const { t, ids } of daftar) skor.push(await rk.skorPasangan(rr, t, ids.map((id) => rk.teksPasal(korpus, idx.get(id)))));
    return { skor, berkas: [...berkas] };
  }, daftar);
  console.log("berkas model:", berkas.join(", "));
  let maks = 0;
  daftar.forEach(({ t, ids }, j) => {
    const a = acuan[kunci(t)];
    const d = Math.max(...ids.map((id, i) => Math.abs(skor[j][i] - a[id])));
    const top = (f) => ids.reduce((x, y) => (f(y) > f(x) ? y : x));
    assert.equal(top((id) => skor[j][ids.indexOf(id)]), top((id) => a[id]), `pasal teratas berbeda: ${t}`);
    maks = Math.max(maks, d);
    console.log(`${d.toFixed(5)}  ${t.slice(0, 60)}`);
  });
  // Batas yang sama dengan uji paritas di Node (scripts/paritas-rerank.mjs).
  assert.ok(maks < 0.02, `skor reranker di peramban berbeda dari evaluasi (maks ${maks})`);
  console.log("paritas reranker di peramban lolos");
} finally {
  await browser.close();
  server.close();
}
