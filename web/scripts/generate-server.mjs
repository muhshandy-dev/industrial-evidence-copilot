// Generasi offline untuk evaluasi model server (Cloudflare Workers AI) dengan prompt, badan
// permintaan, dan pembacaan sitasi yang sama dengan Pages Function situs. Skrip memanggil
// /api/jawab di deploy Preview (binding AI yang sama dengan situs) dengan token OIDC GitHub
// Actions sebagai bukti bahwa pemanggilnya workflow evaluasi repositori ini; tidak ada secret
// Cloudflare. Fungsi menyusun prompt sendiri; sidik prompt dihitung ulang di sini.
//
//   node scripts/generate-server.mjs --in masukan.jsonl --out keluaran.jsonl --model llama-3.3-70b
//                                    --endpoint https://…/api/jawab [--varian bertahan] [--set dev]
//                                    [--lolos] [--batas N] [--senyap]
//
// --senyap: isi jawaban tidak dicetak ke log (untuk set tersegel).
//
// Bila kuota harian gratis habis, skrip berhenti dengan kode 3 tanpa membuang keluaran yang sudah
// ada; run berikutnya melanjutkan (baris dengan prompt_sha yang sama dilewati).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { MODEL_SERVER_KANDIDAT, pasalUntukPrompt, promptSha, susunPesan, teksServer } from "../public/js/gen/prompt.js";
import { OIDC_AUD } from "../../server/oidc.js";

const { values: a } = parseArgs({
  options: {
    in: { type: "string" }, out: { type: "string" }, varian: { type: "string", default: "bertahan" },
    model: { type: "string" }, set: { type: "string" }, batas: { type: "string" },
    lolos: { type: "boolean", default: false }, endpoint: { type: "string" },
    senyap: { type: "boolean", default: false },
  },
});
const M = MODEL_SERVER_KANDIDAT[a.model];
if (!M) throw new Error(`model server tidak dikenal: ${a.model}`);
if (!a.endpoint) throw new Error("--endpoint wajib diisi (Pages Function Preview)");
const { ACTIONS_ID_TOKEN_REQUEST_URL: urlOidc, ACTIONS_ID_TOKEN_REQUEST_TOKEN: tokenOidc } = process.env;
if (!urlOidc || !tokenOidc) throw new Error("token OIDC tidak tersedia; jalankan di GitHub Actions dengan permissions id-token: write");

const korpus = JSON.parse(readFileSync(new URL("../public/data/korpus.json", import.meta.url)));
const baris = readFileSync(a.in, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => !a.set || a.set.split(",").includes(r.set))
  .filter((r) => !a.lolos || r.lolos_gerbang)
  .slice(0, a.batas ? Number(a.batas) : undefined);
const sudah = new Set(existsSync(a.out)
  ? readFileSync(a.out, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((r) => `${r.id}:${r.prompt_sha}`)
  : []);

class KuotaHabis extends Error {}
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

// Token OIDC berumur pendek; diminta ulang setiap empat menit.
let oidc = { nilai: null, waktu: 0 };
async function tokenEvaluasi() {
  if (oidc.nilai && Date.now() - oidc.waktu < 4 * 60000) return oidc.nilai;
  const res = await fetch(`${urlOidc}&audience=${encodeURIComponent(OIDC_AUD)}`, { headers: { authorization: `Bearer ${tokenOidc}` } });
  if (!res.ok) throw new Error(`token OIDC: HTTP ${res.status}`);
  oidc = { nilai: (await res.json()).value, waktu: Date.now() };
  return oidc.nilai;
}

// Badan berisi pertanyaan dan nomor pasal, bukan prompt.
async function panggilEndpoint(r, pasal) {
  const badan = { tanya: r.tanya, pasal: pasal.map((p) => p.id), model: a.model, varian: a.varian };
  for (let coba = 0; ; coba++) {
    const headers = { "content-type": "application/json", authorization: `Bearer ${await tokenEvaluasi()}` };
    const res = await fetch(a.endpoint, { method: "POST", headers, body: JSON.stringify(badan) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      if (j.pasal?.join() !== badan.pasal.join() || j.varian !== a.varian || j.model !== M.id) throw new Error(`respons fungsi tidak cocok: ${JSON.stringify({ ...j, mentah: undefined }).slice(0, 200)}`);
      return { response: j.mentah, usage: j.usage };
    }
    if (res.status === 429) throw new KuotaHabis(JSON.stringify(j));
    if (res.status >= 500 && coba < 4) { await tunggu(2000 * 2 ** coba); continue; }
    throw new Error(`fungsi HTTP ${res.status}: ${JSON.stringify(j)}`);
  }
}

let n = 0;
const t0 = Date.now();
console.log(`${M.id}: ${baris.length} pertanyaan, varian ${a.varian}`);
for (const r of baris) {
  const pasal = pasalUntukPrompt(korpus, r.peringkat);
  const pesan = susunPesan(r.tanya, pasal, a.varian);
  const sha = await promptSha(pesan, M);
  if (sudah.has(`${r.id}:${sha}`)) continue;
  const t = Date.now();
  let hasil;
  try { hasil = await panggilEndpoint(r, pasal); }
  catch (e) {
    if (e instanceof KuotaHabis) { console.log(`kuota harian habis setelah ${n} panggilan: ${e.message}`); process.exit(3); }
    throw e;
  }
  const mentah = teksServer(hasil);
  const rec = {
    id: r.id, set: r.set, tanya: r.tanya, varian: a.varian, prompt_sha: sha,
    model: M.id, revisi: null, dtype: null,
    pasal: pasal.map((p) => p.id), mentah,
    token_prompt: hasil.usage?.prompt_tokens ?? null, token_keluar: hasil.usage?.completion_tokens ?? null,
    detik: Math.round((Date.now() - t) / 100) / 10,
  };
  appendFileSync(a.out, JSON.stringify(rec) + "\n");
  n++;
  console.log(`${r.id} ${rec.detik}s ${rec.token_prompt}+${rec.token_keluar} tok${a.senyap ? "" : `: ${mentah.slice(0, 100).replace(/\n/g, " ")}`}`);
}
console.log(`${n} panggilan baru, ${((Date.now() - t0) / 60000).toFixed(1)} menit`);
