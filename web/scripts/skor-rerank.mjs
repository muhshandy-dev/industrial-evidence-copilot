// Skor reranker versi kuantisasi (RERANKER_Q8) dengan kode situs (transformers.js), untuk pasangan
// (pertanyaan, pasal) yang sama dengan cache fp32 di eval/cache/rerank/mminilm/skor.json.
// Hasilnya ditulis dengan format yang sama ke eval/cache/rerank/mminilm_q8/skor.json, lalu
// `evidence eval` menghitung metrik pencarian untuk sistem bm25_konteks+mminilm_q8.
// Butuh unduhan model dari Hugging Face, jadi dijalankan di GitHub Actions.
//
//   node scripts/skor-rerank.mjs
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as lib from "@huggingface/transformers";
import { RERANKER_Q8, muatReranker, skorPasangan, teksPasal } from "../public/js/gen/rerank.js";

const akar = new URL("../../", import.meta.url);
const korpus = JSON.parse(readFileSync(new URL("web/public/data/korpus.json", akar)));
const acuan = JSON.parse(readFileSync(new URL("eval/cache/rerank/mminilm/skor.json", akar)));
const indeks = new Map(korpus.chunk.map((c, i) => [c.id, i]));

// Kunci cache adalah sidik teks pertanyaan, jadi teksnya dicari dari semua set pertanyaan. Set
// tersegel ikut dinilai (seperti cache fp32) supaya run tersegel tidak perlu menghitung ulang;
// skrip ini tidak mencetak apa pun per pertanyaan.
const kunci = (t) => createHash("sha256").update(t).digest("hex").slice(0, 16);
const teksTanya = new Map();
for (const f of ["eval/questions.jsonl", "eval/stress.jsonl", "eval/sealed/questions.jsonl", "eval/sealed/injeksi.jsonl"]) {
  for (const l of readFileSync(new URL(f, akar), "utf8").split("\n").filter(Boolean)) {
    const t = JSON.parse(l).tanya;
    teksTanya.set(kunci(t), t);
  }
}

const rr = await muatReranker(lib, "cpu", undefined, RERANKER_Q8);
const skor = {};
let n = 0;
let hilang = 0;
const t0 = Date.now();
for (const [k, tabel] of Object.entries(acuan.skor)) {
  const t = teksTanya.get(k);
  if (!t) { hilang++; continue; }
  const ids = Object.keys(tabel);
  const s = await skorPasangan(rr, t, ids.map((id) => teksPasal(korpus, indeks.get(id))));
  skor[k] = Object.fromEntries(ids.map((id, i) => [id, Math.round(s[i] * 1e5) / 1e5]));
  n += ids.length;
}
const out = new URL("eval/cache/rerank/mminilm_q8/", akar);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("skor.json", out), JSON.stringify({
  model: RERANKER_Q8.id, revisi: RERANKER_Q8.revision, berkas: RERANKER_Q8.berkas,
  korpus_sha256: acuan.korpus_sha256, skor,
}) + "\n");
console.log(`${Object.keys(skor).length} pertanyaan, ${n} pasangan, ${hilang} kunci tanpa teks, ${((Date.now() - t0) / 60000).toFixed(1)} menit`);
