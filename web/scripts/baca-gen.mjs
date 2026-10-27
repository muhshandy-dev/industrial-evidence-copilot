// Baca ulang keluaran generasi dengan pembaca sitasi dan pemeriksaan yang sama dengan situs.
// Dipanggil oleh evaluasi Python (`evidence eval`), sehingga perubahan pembaca tidak memerlukan
// generasi ulang.   node scripts/baca-gen.mjs berkas.jsonl [...]  -> JSON ke stdout
import { readFileSync } from "node:fs";
import { MODELS, bacaJawaban, idfDariIndeks, pasalUntukPrompt, periksa, promptSha, susunPesan } from "../public/js/gen/prompt.js";

const korpus = JSON.parse(readFileSync(new URL("../public/data/korpus.json", import.meta.url)));
const indeks = new Map(korpus.chunk.map((c, i) => [c.id, i]));
const bm25 = JSON.parse(readFileSync(new URL("../public/data/indeks.json", import.meta.url)));
const idf = idfDariIndeks(bm25);
const out = [];
for (const f of process.argv.slice(2)) {
  for (const line of readFileSync(f, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line);
    // Alur v2 meringkas pasal panjang menurut pertanyaan; baris tanpa alur adalah v1.
    const opsi = r.alur === "v2" ? { tanya: r.tanya, idf, useStem: bm25.pakai_stem } : null;
    const pasal = pasalUntukPrompt(korpus, r.pasal.map((id) => indeks.get(id)), opsi);
    const baca = bacaJawaban(r.mentah, pasal.length);
    const m = MODELS[r.model];
    const basi = !m || (await promptSha(susunPesan(r.tanya, pasal, r.varian), m)) !== r.prompt_sha;
    out.push({ ...r, basi, pasal_teks: pasal.map((p) => p.teks), baca, periksa: periksa(baca, pasal) });
  }
}
process.stdout.write(JSON.stringify(out));
