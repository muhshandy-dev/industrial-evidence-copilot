// Generasi offline untuk evaluasi model server (Cloudflare Workers AI) dengan prompt, badan
// permintaan, dan pembacaan sitasi yang sama dengan Pages Function situs. Skrip memanggil
// /api/jawab di deploy Preview (binding AI yang sama dengan situs) dengan token OIDC GitHub
// Actions sebagai bukti bahwa pemanggilnya workflow evaluasi repositori ini; tidak ada secret
// Cloudflare. Fungsi menyusun prompt sendiri; sidik prompt dihitung ulang di sini.
//
//   node scripts/generate-server.mjs --in masukan.jsonl --out keluaran.jsonl --model llama-3.3-70b
//                                    --endpoint https://…/api/jawab [--varian bertahan] [--set dev]
//                                    [--lolos] [--batas N] [--senyap] [--alur v1|v2]
//                                    [--salin-dari keluaran-lama.jsonl]
//
// --alur: v1 memotong pasal panjang dari awal; v2 meringkasnya menjadi ayat yang relevan (bawaan v1
// supaya keluaran lama tetap dapat diperiksa). Gerbang alur sudah dihitung di masukan.
// --salin-dari: baris dengan id dan sidik prompt yang sama di berkas lain dipakai ulang tanpa
// memanggil model (prompt identik), ditandai salinan: true. Menghemat kuota.
// --senyap: isi jawaban tidak dicetak ke log (untuk set tersegel).
//
// Bila kuota harian gratis habis, skrip berhenti dengan kode 3 tanpa membuang keluaran yang sudah
// ada; run berikutnya melanjutkan (baris dengan prompt_sha yang sama dilewati).
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { MODEL_SERVER_KANDIDAT, idfDariIndeks, pasalUntukPrompt, promptSha, susunPesan, teksServer } from "../public/js/gen/prompt.js";
import { OIDC_AUD } from "../../server/oidc.js";

const { values: a } = parseArgs({
  options: {
    in: { type: "string" }, out: { type: "string" }, varian: { type: "string", default: "bertahan" },
    model: { type: "string" }, set: { type: "string" }, batas: { type: "string" },
    lolos: { type: "boolean", default: false }, endpoint: { type: "string" },
    senyap: { type: "boolean", default: false },
    alur: { type: "string", default: "v1" }, "salin-dari": { type: "string" },
    "uji-kering": { type: "boolean", default: false },
  },
});
if (!["v1", "v2"].includes(a.alur)) throw new Error(`alur tidak dikenal: ${a.alur}`);
const M = MODEL_SERVER_KANDIDAT[a.model];
if (!M) throw new Error(`model server tidak dikenal: ${a.model}`);
const kering = a["uji-kering"]; // hanya hitung panggilan yang dibutuhkan, tanpa memanggil model
if (!a.endpoint && !kering) throw new Error("--endpoint wajib diisi (Pages Function Preview)");
const { ACTIONS_ID_TOKEN_REQUEST_URL: urlOidc, ACTIONS_ID_TOKEN_REQUEST_TOKEN: tokenOidc } = process.env;
if ((!urlOidc || !tokenOidc) && !kering) throw new Error("token OIDC tidak tersedia; jalankan di GitHub Actions dengan permissions id-token: write");

const korpus = JSON.parse(readFileSync(new URL("../public/data/korpus.json", import.meta.url)));
const bm25 = JSON.parse(readFileSync(new URL("../public/data/indeks.json", import.meta.url)));
const opsiAlur = (tanya) => (a.alur === "v2" ? { tanya, idf: idfDariIndeks(bm25), useStem: bm25.pakai_stem } : null);
const bacaBaris = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
// Baris lama dengan prompt identik (id dan sidik sama) untuk dipakai ulang.
const lama = new Map(a["salin-dari"] ? bacaBaris(a["salin-dari"]).filter((r) => r.model === M.id && r.varian === a.varian).map((r) => [`${r.id}:${r.prompt_sha}`, r]) : []);
const baris = readFileSync(a.in, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .filter((r) => !a.set || a.set.split(",").includes(r.set))
  .filter((r) => !a.lolos || r.lolos_gerbang)
  .slice(0, a.batas ? Number(a.batas) : undefined);
const sudah = new Set(bacaBaris(a.out).filter((r) => (r.alur ?? "v1") === a.alur).map((r) => `${r.id}:${r.prompt_sha}`));

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
  const badan = { tanya: r.tanya, pasal: pasal.map((p) => p.id), model: a.model, varian: a.varian, alur: a.alur };
  for (let coba = 0; ; coba++) {
    const headers = { "content-type": "application/json", authorization: `Bearer ${await tokenEvaluasi()}` };
    const res = await fetch(a.endpoint, { method: "POST", headers, body: JSON.stringify(badan) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      if (j.pasal?.join() !== badan.pasal.join() || j.varian !== a.varian || j.model !== M.id || j.alur !== a.alur) throw new Error(`respons fungsi tidak cocok: ${JSON.stringify({ ...j, mentah: undefined }).slice(0, 200)}`);
      return { response: j.mentah, usage: j.usage };
    }
    if (res.status === 429) throw new KuotaHabis(JSON.stringify(j));
    if (res.status >= 500 && coba < 4) { await tunggu(2000 * 2 ** coba); continue; }
    throw new Error(`fungsi HTTP ${res.status}: ${JSON.stringify(j)}`);
  }
}

let n = 0;
let salin = 0;
const t0 = Date.now();
console.log(`${M.id}: ${baris.length} pertanyaan, varian ${a.varian}`);
for (const r of baris) {
  const pasal = pasalUntukPrompt(korpus, r.peringkat, opsiAlur(r.tanya));
  const pesan = susunPesan(r.tanya, pasal, a.varian);
  const sha = await promptSha(pesan, M);
  if (sudah.has(`${r.id}:${sha}`)) continue;
  const salinan = lama.get(`${r.id}:${sha}`);
  if (kering) { if (salinan && salinan.set === r.set) salin++; else { n++; console.log(`perlu panggilan: ${r.id}`); } continue; }
  if (salinan && salinan.set === r.set) {
    appendFileSync(a.out, JSON.stringify({ ...salinan, alur: a.alur, salinan: true }) + "\n");
    salin++;
    continue;
  }
  const t = Date.now();
  let hasil;
  try { hasil = await panggilEndpoint(r, pasal); }
  catch (e) {
    if (e instanceof KuotaHabis) { console.log(`kuota harian habis setelah ${n} panggilan: ${e.message}`); process.exit(3); }
    throw e;
  }
  const mentah = teksServer(hasil);
  const rec = {
    id: r.id, set: r.set, tanya: r.tanya, varian: a.varian, alur: a.alur, prompt_sha: sha,
    model: M.id, revisi: null, dtype: null,
    pasal: pasal.map((p) => p.id), mentah,
    token_prompt: hasil.usage?.prompt_tokens ?? null, token_keluar: hasil.usage?.completion_tokens ?? null,
    detik: Math.round((Date.now() - t) / 100) / 10,
  };
  appendFileSync(a.out, JSON.stringify(rec) + "\n");
  n++;
  console.log(`${r.id} ${rec.detik}s ${rec.token_prompt}+${rec.token_keluar} tok${a.senyap ? "" : `: ${mentah.slice(0, 100).replace(/\n/g, " ")}`}`);
}
console.log(`${n} panggilan baru, ${salin} disalin dari keluaran dengan prompt identik, ${((Date.now() - t0) / 60000).toFixed(1)} menit`);
