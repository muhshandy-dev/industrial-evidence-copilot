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

// Salin fungsi dan prompt.js ke folder sementara dengan MODEL_SERVER aktif.
async function muatFungsi(aktif) {
  const d = mkdtempSync(join(tmpdir(), "fungsi-"));
  cpSync(join(akar, "functions"), join(d, "functions"), { recursive: true });
  cpSync(join(akar, "web/public/js/gen"), join(d, "web/public/js/gen"), { recursive: true });
  if (aktif) {
    const p = join(d, "web/public/js/gen/prompt.js");
    writeFileSync(p, readFileSync(p, "utf8").replace("export const MODEL_SERVER = null;", 'export const MODEL_SERVER = MODEL_SERVER_KANDIDAT["mistral-small-3.1"];'));
  }
  return import(join(d, "functions/api/jawab.js"));
}

const asal = "https://contoh.pages.dev";
const ids = JSON.parse(korpus).chunk.slice(0, 3).map((c) => c.id);
function env(ai) {
  return { ASSETS: { fetch: async () => new Response(korpus) }, AI: ai };
}
const minta = (badan, headers = {}) => new Request(`${asal}/api/jawab`, { method: "POST", body: typeof badan === "string" ? badan : JSON.stringify(badan), headers: { origin: asal, ...headers } });

test("nonaktif selama MODEL_SERVER null", async () => {
  const f = await muatFungsi(false);
  assert.deepEqual(await f.onRequestGet({ env: {} }).json(), { aktif: false, model: null, binding: false });
  const r = await f.onRequestPost({ request: minta({ tanya: "apa itu APD?", pasal: ids }), env: env({}) });
  assert.equal(r.status, 503);
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

test("Preview boleh memilih kandidat model dan varian; produksi tidak", async () => {
  const f = await muatFungsi(false);
  const panggilan = [];
  const ai = { run: async (model, badan) => { panggilan.push([model, badan]); return { response: "Ya [1].", usage: { prompt_tokens: 10 } }; } };
  assert.equal((await f.onRequestGet({ env: env(ai) }).json()).binding, true);
  assert.equal((await f.onRequestGet({ env: {} }).json()).binding, false);
  const r = await f.onRequestPost({ request: minta({ tanya: "Apa kewajiban pengurus?", pasal: ids, model: "llama-4-scout", varian: "k3" }), env: env(ai) });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.model, "@cf/meta/llama-4-scout-17b-16e-instruct");
  assert.equal(j.varian, "k3");
  assert.deepEqual(j.usage, { prompt_tokens: 10 });
  assert.equal(panggilan[0][1].messages.length, 4); // k3: contoh sebagai giliran percakapan
  const salah = await f.onRequestPost({ request: minta({ tanya: "Apa itu APD?", pasal: ids, model: "gpt-lain" }), env: env(ai) });
  assert.equal(salah.status, 400);
  const prod = `https://${f.HOST_PRODUKSI}`;
  const req = new Request(`${prod}/api/jawab`, { method: "POST", headers: { origin: prod }, body: JSON.stringify({ tanya: "Apa itu APD?", pasal: ids, model: "mistral-small-3.1" }) });
  assert.equal((await f.onRequestPost({ request: req, env: env(ai) })).status, 403);
  assert.equal(panggilan.length, 1);
});
