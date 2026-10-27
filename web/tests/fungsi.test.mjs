// Pages Function /api/jawab dengan env tiruan (ASSETS dan AI). MODEL_SERVER ditimpa lewat
// salinan modul supaya uji tidak bergantung pada model yang sedang dipilih.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const akar = fileURLToPath(new URL("../..", import.meta.url));
const korpus = readFileSync(join(akar, "web/public/data/korpus.json"), "utf8");
const indeksTeks = readFileSync(join(akar, "web/public/data/indeks.json"), "utf8");

// Salin fungsi dan prompt.js ke folder sementara dengan MODEL_SERVER aktif.
async function muatFungsi(aktif) {
  const d = mkdtempSync(join(tmpdir(), "fungsi-"));
  cpSync(join(akar, "functions"), join(d, "functions"), { recursive: true });
  cpSync(join(akar, "server"), join(d, "server"), { recursive: true });
  cpSync(join(akar, "web/public/js"), join(d, "web/public/js"), { recursive: true });
  const p = join(d, "web/public/js/gen/prompt.js");
  const isi = readFileSync(p, "utf8").replace(/export const MODEL_SERVER = [^;]+;/,
    aktif ? 'export const MODEL_SERVER = MODEL_SERVER_KANDIDAT["mistral-small-3.1"];' : "export const MODEL_SERVER = null;");
  writeFileSync(p, isi);
  return import(join(d, "functions/api/jawab.js"));
}

const asal = "https://contoh.pages.dev";
const ids = JSON.parse(korpus).chunk.slice(0, 3).map((c) => c.id);
function env(ai) {
  return { ASSETS: { fetch: async (u) => new Response(String(u).endsWith("/data/indeks.json") ? indeksTeks : korpus) }, AI: ai };
}
// Setiap permintaan uji dari IP berbeda, kecuali uji batas per menit yang menentukan IP sendiri.
let nomorIp = 0;
const minta = (badan, headers = {}) => new Request(`${asal}/api/jawab`, {
  method: "POST", body: typeof badan === "string" ? badan : JSON.stringify(badan),
  headers: { origin: asal, "cf-connecting-ip": `198.51.100.${++nomorIp % 250}`, ...headers },
});

test("nonaktif selama MODEL_SERVER null", async () => {
  const f = await muatFungsi(false);
  assert.deepEqual(await f.onRequestGet({ env: {} }).json(), { aktif: false, model: null, binding: false, alur: "v2" });
  const r = await f.onRequestPost({ request: minta({ tanya: "apa itu APD?", pasal: ids }), env: env({}) });
  assert.equal(r.status, 503);
});

test("domain produksi: mode generatif tidak aktif (RAG Research Prototype)", async () => {
  const f = await muatFungsi(true);
  const panggilan = [];
  const ai = { run: async (...a) => { panggilan.push(a); return { response: "Jawaban [1]." }; } };
  const prod = `https://${f.HOST_PRODUKSI}`;
  const get = await f.onRequestGet({ request: new Request(`${prod}/api/jawab`), env: env(ai) }).json();
  assert.equal(get.aktif, false);
  assert.equal(get.model, null);
  // Preview tetap aktif sebagai prototipe riset.
  assert.equal((await f.onRequestGet({ request: new Request(`${asal}/api/jawab`), env: env(ai) }).json()).aktif, true);
  const r = await f.onRequestPost({ request: new Request(`${prod}/api/jawab`, {
    method: "POST", body: JSON.stringify({ tanya: "Apa kewajiban pengurus?", pasal: ids }),
    headers: { origin: prod, "cf-connecting-ip": "203.0.113.9" },
  }), env: env(ai) });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).galat, "prototipe_riset_tidak_aktif_di_produksi");
  assert.equal(panggilan.length, 0);
});

test("menyusun prompt sendiri dari korpus dan memanggil model yang dipatok", async () => {
  const f = await muatFungsi(true);
  const panggilan = [];
  const ai = { run: async (model, badan) => { panggilan.push([model, badan]); return { response: "Jawaban [1]." }; } };
  const r = await f.onRequestPost({ request: minta({ tanya: "Apa kewajiban pengurus?", pasal: ids }), env: env(ai) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.mentah, "Jawaban [1].");
  assert.deepEqual(j.pasal, ids);
  const [model, badan] = panggilan[0];
  assert.equal(model, "@cf/mistralai/mistral-small-3.1-24b-instruct");
  assert.equal(badan.temperature, 0);
  assert.equal(badan.messages[0].role, "system");
  const k = JSON.parse(korpus).chunk[0];
  assert.ok(badan.messages.at(-1).content.includes(k.teks.trim().slice(0, 60)));
  assert.ok(badan.messages.at(-1).content.includes("Apa kewajiban pengurus?"));
});

test("menolak masukan yang tidak sah dan asal lain", async () => {
  const f = await muatFungsi(true);
  const ai = { run: async () => { throw new Error("tidak boleh dipanggil"); } };
  const kasus = [
    [minta({ tanya: "Apa?", pasal: ids }, { origin: "https://lain.example" }), 403],
    [minta("bukan json"), 400],
    [minta({ tanya: "x".repeat(501), pasal: ids }), 400],
    [minta({ tanya: "Apa itu?", pasal: [] }), 400],
    [minta({ tanya: "Apa itu?", pasal: [ids[0], ids[0]] }), 400],
    [minta({ tanya: "Apa itu?", pasal: ["tidak-ada"] }), 400],
    [minta({ tanya: "Apa itu?", pasal: [...ids, ...JSON.parse(korpus).chunk.slice(3, 5).map((c) => c.id)] }), 400],
    [minta("x".repeat(5000)), 413],
  ];
  for (const [req, status] of kasus) assert.equal((await f.onRequestPost({ request: req, env: env(ai) })).status, status);
});

test("kuota habis menjadi 429, galat lain 502", async () => {
  const f = await muatFungsi(true);
  const habis = { run: async () => { throw new Error("4006: you have used up your daily free allocation of 10,000 neurons"); } };
  assert.equal((await f.onRequestPost({ request: minta({ tanya: "Apa itu APD?", pasal: ids }), env: env(habis) })).status, 429);
  const rusak = { run: async () => { throw new Error("internal"); } };
  assert.equal((await f.onRequestPost({ request: minta({ tanya: "Apa itu APD?", pasal: ids }), env: env(rusak) })).status, 502);
});

// Token OIDC tiruan: pasangan kunci RSA lokal, JWKS disajikan lewat fetch tiruan.
const pasangan = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwkPublik = { ...(await crypto.subtle.exportKey("jwk", pasangan.publicKey)), kid: "uji", alg: "RS256", use: "sig" };
const fetchAsli = globalThis.fetch;
globalThis.fetch = async (url, ...lain) => (String(url).startsWith("https://token.actions.githubusercontent.com/")
  ? new Response(JSON.stringify({ keys: [jwkPublik] })) : fetchAsli(url, ...lain));
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
async function tokenUji(ubah = {}, kunci = pasangan.privateKey) {
  const t = Math.floor(Date.now() / 1000);
  const klaim = {
    iss: "https://token.actions.githubusercontent.com", aud: "industrial-evidence-copilot-evaluasi",
    repository: "muhshandy-dev/industrial-evidence-copilot",
    job_workflow_ref: "muhshandy-dev/industrial-evidence-copilot/.github/workflows/eksperimen-server.yml@refs/heads/x",
    iat: t, nbf: t, exp: t + 300, ...ubah,
  };
  const isi = `${b64({ alg: "RS256", kid: "uji", typ: "JWT" })}.${b64(klaim)}`;
  const ttd = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kunci, new TextEncoder().encode(isi));
  return `${isi}.${Buffer.from(ttd).toString("base64url")}`;
}
const mintaEvaluasi = (badan, token, host = asal) => new Request(`${host}/api/jawab`, {
  method: "POST", body: JSON.stringify(badan), headers: { authorization: `Bearer ${token}` },
});

test("jalur evaluasi: hanya Preview dan hanya dengan token OIDC workflow evaluasi", async () => {
  const f = await muatFungsi(false);
  const panggilan = [];
  const ai = { run: async (model, badan) => { panggilan.push([model, badan]); return { response: "Ya [1].", usage: { prompt_tokens: 10 } }; } };
  assert.equal((await f.onRequestGet({ env: env(ai) }).json()).binding, true);
  assert.equal((await f.onRequestGet({ env: {} }).json()).binding, false);
  const badan = { tanya: "Apa kewajiban pengurus?", pasal: ids, model: "llama-4-scout", varian: "k3" };

  const r = await f.onRequestPost({ request: mintaEvaluasi(badan, await tokenUji()), env: env(ai) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.model, "@cf/meta/llama-4-scout-17b-16e-instruct");
  assert.equal(j.varian, "k3");
  assert.deepEqual(j.usage, { prompt_tokens: 10 });
  assert.equal(panggilan[0][1].messages.length, 4); // k3: contoh sebagai giliran percakapan

  // Tanpa token: pengunjung tidak boleh memilih model.
  assert.equal((await f.onRequestPost({ request: minta(badan), env: env(ai) })).status, 403);
  // Token yang tidak sah.
  const { privateKey: kunciLain } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  const salah = [
    ["tanda_tangan_salah", await tokenUji({}, kunciLain)],
    ["repositori_salah", await tokenUji({ repository: "orang-lain/industrial-evidence-copilot" })],
    ["workflow_ditolak", await tokenUji({ job_workflow_ref: "muhshandy-dev/industrial-evidence-copilot/.github/workflows/ci.yml@refs/heads/x" })],
    ["audiens_salah", await tokenUji({ aud: "lain" })],
    ["kedaluwarsa", await tokenUji({ exp: Math.floor(Date.now() / 1000) - 10 })],
    ["token_tidak_sah", "bukan.token"],
  ];
  for (const [alasan, token] of salah) {
    const res = await f.onRequestPost({ request: mintaEvaluasi(badan, token), env: env(ai) });
    assert.equal(res.status, 401, alasan);
    assert.equal((await res.json()).alasan, alasan);
  }
  // Domain produksi menolak jalur evaluasi walau tokennya sah.
  const prod = await f.onRequestPost({ request: mintaEvaluasi(badan, await tokenUji(), `https://${f.HOST_PRODUKSI}`), env: env(ai) });
  assert.equal(prod.status, 403);
  // Model yang tidak dikenal.
  assert.equal((await f.onRequestPost({ request: mintaEvaluasi({ ...badan, model: "gpt-lain" }, await tokenUji()), env: env(ai) })).status, 400);
  // Workflow holdout v2 boleh memakai jalur evaluasi.
  const holdout = await tokenUji({ job_workflow_ref: "muhshandy-dev/industrial-evidence-copilot/.github/workflows/holdout-v2.yml@refs/heads/x" });
  assert.equal((await f.onRequestPost({ request: mintaEvaluasi(badan, holdout), env: env(ai) })).status, 200);
  assert.equal(panggilan.length, 2);
});

test("pengunjung: Origin wajib dan batas permintaan per menit", async () => {
  const f = await muatFungsi(true);
  const ai = { run: async () => ({ response: "Ya [1]." }) };
  const tanpaAsal = new Request(`${asal}/api/jawab`, { method: "POST", body: JSON.stringify({ tanya: "Apa itu APD?", pasal: ids }) });
  assert.equal((await f.onRequestPost({ request: tanpaAsal, env: env(ai) })).status, 403);
  const status = [];
  for (let i = 0; i < f.BATAS_PER_MENIT + 1; i++) {
    const req = minta({ tanya: "Apa itu APD?", pasal: ids }, { "cf-connecting-ip": "203.0.113.9" });
    status.push((await f.onRequestPost({ request: req, env: env(ai) })).status);
  }
  assert.deepEqual(status, [...Array(f.BATAS_PER_MENIT).fill(200), 429]);
  const lain = minta({ tanya: "Apa itu APD?", pasal: ids }, { "cf-connecting-ip": "203.0.113.10" });
  assert.equal((await f.onRequestPost({ request: lain, env: env(ai) })).status, 200);
});

test("nama tampilan model tidak mengubah sidik prompt", async () => {
  const { MODEL_SERVER_KANDIDAT, promptSha } = await import("../public/js/gen/prompt.js");
  const m = MODEL_SERVER_KANDIDAT["llama-3.3-70b"];
  const pesan = [{ role: "user", content: "uji" }];
  assert.equal(await promptSha(pesan, m), await promptSha(pesan, { ...m, nama: "lain" }));
  assert.notEqual(await promptSha(pesan, m), await promptSha(pesan, { ...m, id: "@cf/lain" }));
});

test("alur v2: pasal panjang diringkas menurut pertanyaan; v1 hanya lewat evaluasi", async () => {
  const f = await muatFungsi(true);
  const { MAX_KARAKTER_PASAL, PENANDA_LONCAT } = await import("../public/js/gen/prompt.js");
  const k = JSON.parse(korpus);
  const panjang = k.chunk.find((c) => c.teks.trim().length > MAX_KARAKTER_PASAL);
  const panggilan = [];
  const ai = { run: async (model, badan) => { panggilan.push(badan); return { response: "Jawaban [1]." }; } };
  const r = await f.onRequestPost({ request: minta({ tanya: "apa saja syarat yang diatur?", pasal: [panjang.id] }), env: env(ai) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).alur, "v2");
  const isi = panggilan[0].messages.at(-1).content;
  assert.ok(isi.length < panjang.teks.length + 500);
  assert.ok(isi.includes(PENANDA_LONCAT) || isi.includes(" …"));
  // Pengunjung tidak boleh memilih alur.
  const v1 = await f.onRequestPost({ request: minta({ tanya: "apa saja syarat yang diatur?", pasal: [panjang.id], alur: "v1" }), env: env(ai) });
  assert.equal(v1.status, 403);
});
