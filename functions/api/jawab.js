// Pages Function: jawaban generatif lewat Cloudflare Workers AI (binding env.AI).
//
// Peramban sudah mencari dan mengurutkan pasal (BM25 + reranker, gerbang skor yang sama). Fungsi ini
// hanya menerima pertanyaan dan nomor pasal, lalu menyusun prompt sendiri dari korpus situs dengan
// kode prompt yang sama dengan evaluasi. Jadi kuota tidak bisa dipakai untuk prompt bebas.
//
//   GET  /api/jawab  -> {aktif, model}
//   POST /api/jawab  {tanya, pasal: [id pasal, urut dari peringkat 1]} -> {mentah, model, pasal}
import {
  K_PASAL, MODEL_SERVER, VARIAN_SERVER, pasalUntukPrompt, permintaanServer, susunPesan, teksServer,
} from "../../web/public/js/gen/prompt.js";

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

export function onRequestGet() {
  return json({ aktif: MODEL_SERVER !== null, model: MODEL_SERVER?.id ?? null });
}

export async function onRequestPost({ request, env }) {
  if (!MODEL_SERVER) return json({ galat: "mode_server_nonaktif" }, 503);
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
  if (tanya.length < 3 || tanya.length > MAKS_TANYA) return json({ galat: "pertanyaan_tidak_sah" }, 400);
  if (!ids.length || ids.length > K_PASAL || new Set(ids).size !== ids.length) return json({ galat: "pasal_tidak_sah" }, 400);

  await muatKorpus(env, request.url);
  const idx = ids.map((id) => indeks.get(id));
  if (idx.some((i) => i === undefined)) return json({ galat: "pasal_tidak_dikenal" }, 400);

  const pasal = pasalUntukPrompt(korpus, idx);
  const pesan = susunPesan(tanya, pasal, VARIAN_SERVER);
  try {
    const hasil = await env.AI.run(MODEL_SERVER.id, permintaanServer(pesan));
    return json({ mentah: teksServer(hasil), model: MODEL_SERVER.id, pasal: pasal.map((p) => p.id) });
  } catch (e) {
    if (kuotaHabis(e)) return json({ galat: "kuota_habis" }, 429);
    return json({ galat: "model_gagal" }, 502);
  }
}
