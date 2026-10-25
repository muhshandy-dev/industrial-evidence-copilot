// Pages Function: jawaban generatif lewat Cloudflare Workers AI (binding env.AI).
//
// Peramban sudah mencari dan mengurutkan pasal (BM25 + reranker, gerbang skor yang sama). Fungsi ini
// hanya menerima pertanyaan dan nomor pasal, lalu menyusun prompt sendiri dari korpus situs dengan
// kode prompt yang sama dengan evaluasi. Jadi kuota tidak bisa dipakai untuk prompt bebas.
//
//   GET  /api/jawab  -> {aktif, model, binding}
//   POST /api/jawab  {tanya, pasal: [id pasal, urut dari peringkat 1]} -> {mentah, model, pasal, usage}
//
// Perlindungan:
// - Pengunjung: hanya dari halaman situs ini (header Origin wajib dan sama), masukan dibatasi, dan
//   paling banyak BATAS_PER_MENIT permintaan per alamat IP per menit (per isolate, upaya terbaik).
//   Batas keras biaya adalah kuota gratis harian Workers AI; bila habis, situs kembali ke kutipan.
// - Evaluasi: memilih kandidat model dan varian prompt ({model, varian}) hanya di deploy Preview
//   (bukan domain produksi) dan hanya dengan token OIDC GitHub Actions dari workflow evaluasi
//   repositori ini (server/oidc.js). Tanpa token itu, permintaan ditolak 401.
import { periksaOidc } from "../../server/oidc.js";
import {
  K_PASAL, MODEL_SERVER, MODEL_SERVER_KANDIDAT, VARIAN, VARIAN_SERVER, pasalUntukPrompt, permintaanServer, susunPesan, teksServer,
} from "../../web/public/js/gen/prompt.js";

export const HOST_PRODUKSI = "industrial-evidence-copilot.pages.dev";

const MAKS_TANYA = 500;
const MAKS_BADAN = 4096;
export const BATAS_PER_MENIT = 6;

// Penghitung per IP di memori isolate. Bukan batas global (Cloudflare dapat menjalankan banyak
// isolate), tetapi cukup untuk meredam pengulangan cepat dari satu klien.
const jejak = new Map();
function terlaluSering(ip, sekarang = Date.now()) {
  if (jejak.size > 5000) jejak.clear();
  const daftar = (jejak.get(ip) ?? []).filter((t) => sekarang - t < 60000);
  if (daftar.length >= BATAS_PER_MENIT) { jejak.set(ip, daftar); return true; }
  daftar.push(sekarang);
  jejak.set(ip, daftar);
  return false;
}

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

  const url = new URL(request.url);
  const otorisasi = request.headers.get("authorization") ?? "";
  const evaluasi = otorisasi.startsWith("Bearer ");
  if (evaluasi) {
    if (url.hostname === HOST_PRODUKSI) return json({ galat: "evaluasi_hanya_preview" }, 403);
    const hasil = await periksaOidc(otorisasi.slice(7)).catch(() => "verifikasi_gagal");
    if (typeof hasil === "string") return json({ galat: "evaluasi_ditolak", alasan: hasil }, 401);
  } else {
    // Pengunjung: hanya dari halaman situs ini sendiri.
    if (request.headers.get("origin") !== url.origin) return json({ galat: "asal_ditolak" }, 403);
    if (terlaluSering(request.headers.get("cf-connecting-ip") ?? "?")) return json({ galat: "terlalu_sering" }, 429);
  }

  const teks = await request.text();
  if (teks.length > MAKS_BADAN) return json({ galat: "permintaan_terlalu_besar" }, 413);
  let badan;
  try { badan = JSON.parse(teks); } catch { return json({ galat: "json_tidak_sah" }, 400); }
  const tanya = typeof badan?.tanya === "string" ? badan.tanya.trim() : "";
  const ids = Array.isArray(badan?.pasal) ? badan.pasal : [];
  let model = MODEL_SERVER;
  let varian = VARIAN_SERVER;
  if (badan?.model !== undefined || badan?.varian !== undefined) {
    if (!evaluasi) return json({ galat: "pilihan_model_butuh_evaluasi" }, 403);
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
    // Rincian galat hanya untuk evaluasi, untuk diagnosis.
    const rinci = evaluasi ? { rinci: String(e?.message ?? e).slice(0, 300) } : {};
    return json({ galat: "model_gagal", ...rinci }, 502);
  }
}
