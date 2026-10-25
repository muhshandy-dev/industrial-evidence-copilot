// Pages Function: jawaban generatif lewat Cloudflare Workers AI (binding env.AI).
//
// Peramban sudah mencari dan mengurutkan pasal (BM25 + reranker, gerbang skor yang sama). Fungsi ini
// hanya menerima pertanyaan dan nomor pasal, lalu menyusun prompt sendiri dari korpus situs dengan
// kode prompt yang sama dengan evaluasi. Jadi kuota tidak bisa dipakai untuk prompt bebas.
//
//   GET  /api/jawab  -> {aktif, model, binding}
//   POST /api/jawab  {tanya, pasal: [id pasal, urut dari peringkat 1]} -> {mentah, model, pasal, usage}
//
// Khusus deploy Preview (bukan domain produksi), evaluasi boleh memilih salah satu kandidat model
// dan varian prompt yang sudah ada ({model, varian}), supaya kandidat diuji lewat jalur binding
// yang sama dengan situs. Domain produksi selalu memakai MODEL_SERVER dan VARIAN_SERVER.
import {
  K_PASAL, MODEL_SERVER, MODEL_SERVER_KANDIDAT, VARIAN, VARIAN_SERVER, pasalUntukPrompt, permintaanServer, susunPesan, teksServer,
} from "../../web/public/js/gen/prompt.js";

export const HOST_PRODUKSI = "industrial-evidence-copilot.pages.dev";

const MAKS_TANYA = 500;
const MAKS_BADAN = 4096;

let korpus = null;
let indeks = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function muatKorpus(env, url) {
  if (korpus) return;
  const res = await env.ASSETS.fetch(new URL("/data/korpus.json", url));
  if (!res.ok) throw new Error(`korpus: HTTP ${res.status}`);
  korpus = await res.json();
  indeks = new Map(korpus.chunk.map((c, i) => [c.id, i]));
}

// Kuota harian gratis habis: Workers AI mengembalikan galat 4006.
const kuotaHabis = (e) => /4006|daily free allocation|neurons/i.test(String(e?.message ?? e));

export function onRequestGet({ env }) {
  return json({ aktif: MODEL_SERVER !== null, model: MODEL_SERVER?.id ?? null, binding: Boolean(env?.AI) });
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ galat: "binding_ai_belum_dipasang" }, 503);

  // Hanya halaman situs ini sendiri (permintaan lintas situs dari peramban ditolak).
  const asal = request.headers.get("origin");
  if (asal && asal !== new URL(request.url).origin) return json({ galat: "asal_ditolak" }, 403);

  const teks = await request.text();
  if (teks.length > MAKS_BADAN) return json({ galat: "permintaan_terlalu_besar" }, 413);
  let badan;
  try { badan = JSON.parse(teks); } catch { return json({ galat: "json_tidak_sah" }, 400); }
  const tanya = typeof badan?.tanya === "string" ? badan.tanya.trim() : "";
  const ids = Array.isArray(badan?.pasal) ? badan.pasal : [];
  let model = MODEL_SERVER;
  let varian = VARIAN_SERVER;
  if (badan?.model !== undefined || badan?.varian !== undefined) {
    if (new URL(request.url).hostname === HOST_PRODUKSI) return json({ galat: "pilihan_model_hanya_preview" }, 403);
    if (badan.model !== undefined) model = MODEL_SERVER_KANDIDAT[badan.model];
    if (badan.varian !== undefined) varian = VARIAN.includes(badan.varian) ? badan.varian : null;
    if (!model || !varian) return json({ galat: "model_atau_varian_tidak_dikenal" }, 400);
  }
  if (!model) return json({ galat: "mode_server_nonaktif" }, 503);
  if (tanya.length < 3 || tanya.length > MAKS_TANYA) return json({ galat: "pertanyaan_tidak_sah" }, 400);
  if (!ids.length || ids.length > K_PASAL || new Set(ids).size !== ids.length) return json({ galat: "pasal_tidak_sah" }, 400);

  await muatKorpus(env, request.url);
  const idx = ids.map((id) => indeks.get(id));
  if (idx.some((i) => i === undefined)) return json({ galat: "pasal_tidak_dikenal" }, 400);

  const pasal = pasalUntukPrompt(korpus, idx);
  const pesan = susunPesan(tanya, pasal, varian);
  try {
    const hasil = await env.AI.run(model.id, permintaanServer(pesan));
    return json({ mentah: teksServer(hasil), model: model.id, varian, pasal: pasal.map((p) => p.id), usage: hasil?.usage ?? null });
  } catch (e) {
    if (kuotaHabis(e)) return json({ galat: "kuota_habis" }, 429);
    return json({ galat: "model_gagal" }, 502);
  }
}
