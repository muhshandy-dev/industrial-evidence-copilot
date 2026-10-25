// Paritas reranker di Chromium sungguhan: skor reranker situs (bobot dan runtime WebAssembly yang
// dipakai pengunjung) dibandingkan dengan cache skor yang dipakai evaluasi. Butuh unduhan dari
// jsDelivr dan Hugging Face, jadi dijalankan di GitHub Actions.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { RERANKER } from "../public/js/gen/rerank.js";
import { startServer } from "./serve.mjs";

const akar = new URL("../../", import.meta.url);
const baca = (k) => JSON.parse(readFileSync(new URL(`eval/cache/rerank/${k}/skor.json`, akar))).skor;
const acuan = baca(RERANKER.kunci ?? "mminilm");
const fp32 = baca("mminilm");
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
    const a = acuan[kunci(t)], f = fp32[kunci(t)];
    const d = Math.max(...ids.map((id, i) => Math.abs(skor[j][i] - a[id])));
    const df = Math.max(...ids.map((id, i) => Math.abs(skor[j][i] - f[id])));
    maks = Math.max(maks, d);
    console.log(`${d.toFixed(5)} (fp32 ${df.toFixed(5)})  ${t.slice(0, 60)}`);
  });
  assert.ok(maks < 1e-3, `skor reranker di peramban berbeda dari cache evaluasi (maks ${maks})`);
  console.log("paritas reranker di peramban lolos");
} finally {
  await browser.close();
  server.close();
}
