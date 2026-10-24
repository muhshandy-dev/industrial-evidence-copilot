// Generasi offline untuk evaluasi: model, prompt, dan pembacaan sitasi yang sama dengan situs.
// Dijalankan di GitHub Actions (butuh unduhan model dari Hugging Face).
//
//   node scripts/generate.mjs --in masukan.jsonl --out keluaran.jsonl [--varian bertahan|polos]
//                             [--set dev,test] [--shard 0 --shards 4] [--batas N]
//
// Masukan per baris: {id, set, tanya, peringkat: [indeks pasal dari peringkat 1]}, dibuat oleh
// `evidence gen-input`. Baris keluaran yang prompt-nya sudah ada (prompt_sha sama) dilewati,
// jadi run yang terputus dapat dilanjutkan.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { pipeline } from "@huggingface/transformers";
import { MODEL, MAX_TOKEN_BARU, pasalUntukPrompt, promptSha as hitungSha, susunPesan } from "../public/js/gen/prompt.js";

const { values: a } = parseArgs({
  options: {
    in: { type: "string" }, out: { type: "string" }, varian: { type: "string", default: "bertahan" },
    shard: { type: "string", default: "0" }, shards: { type: "string", default: "1" },
    set: { type: "string" }, batas: { type: "string" }, dtype: { type: "string", default: MODEL.dtype },
  },
});
const korpus = JSON.parse(readFileSync(new URL("../public/data/korpus.json", import.meta.url)));
const baris = readFileSync(a.in, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => !a.set || a.set.split(",").includes(r.set))
  .filter((_, i) => i % Number(a.shards) === Number(a.shard))
  .slice(0, a.batas ? Number(a.batas) : undefined);
const sudah = new Set(existsSync(a.out)
  ? readFileSync(a.out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => `${r.id}:${r.prompt_sha}`)
  : []);

const t0 = Date.now();
const gen = await pipeline("text-generation", MODEL.id, { revision: MODEL.revision, dtype: a.dtype, device: "cpu" });
console.log(`model dimuat dalam ${((Date.now() - t0) / 1000).toFixed(0)} detik; ${baris.length} pertanyaan, varian ${a.varian}, dtype ${a.dtype}`);

for (const r of baris) {
  const pasal = pasalUntukPrompt(korpus, r.peringkat);
  const pesan = susunPesan(r.tanya, pasal, a.varian);
  const promptSha = await hitungSha(pesan, a.dtype);
  if (sudah.has(`${r.id}:${promptSha}`)) continue;
  const teksPrompt = gen.tokenizer.apply_chat_template(pesan, { tokenize: false, add_generation_prompt: true });
  const nPrompt = gen.tokenizer.encode(teksPrompt).length;
  const t = Date.now();
  const out = await gen(pesan, { max_new_tokens: MAX_TOKEN_BARU, do_sample: false });
  const mentah = out[0].generated_text.at(-1).content;
  const rec = {
    id: r.id, set: r.set, tanya: r.tanya, varian: a.varian, prompt_sha: promptSha,
    model: MODEL.id, revisi: MODEL.revision, dtype: a.dtype,
    pasal: pasal.map((p) => p.id), mentah,
    token_prompt: nPrompt, token_keluar: gen.tokenizer.encode(mentah).length,
    detik: Math.round((Date.now() - t) / 100) / 10,
  };
  appendFileSync(a.out, JSON.stringify(rec) + "\n");
  console.log(`${r.id} ${rec.detik}s ${rec.token_prompt}+${rec.token_keluar} tok: ${mentah.slice(0, 100).replace(/\n/g, " ")}`);
}
console.log(`selesai dalam ${((Date.now() - t0) / 60000).toFixed(1)} menit`);
