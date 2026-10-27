// Pages Function: jawaban generatif lewat Cloudflare Workers AI (binding env.AI).
//
// Peramban sudah mencari dan mengurutkan pasal (BM25 + reranker, gerbang skor yang sama). Fungsi ini
// hanya menerima pertanyaan dan nomor pasal, lalu menyusun prompt sendiri dari korpus situs dengan
// kode prompt yang sama dengan evaluasi. Jadi kuota tidak bisa dipakai untuk prompt bebas.
//
//   GET  /api/jawab  -> {aktif, model, binding, alur}
//   POST /api/jawab  {tanya, pasal: [id pasal, urut dari peringkat 1]} -> {mentah, model, alur, pasal, usage}
//
// Perlindungan:
// - Pengunjung: hanya dari halaman situs ini (header Origin wajib dan sama), masukan dibatasi, dan
//   paling banyak BATAS_PER_MENIT permintaan per alamat IP per menit (per isolate, upaya terbaik).
//   Batas keras biaya adalah kuota gratis harian Workers AI; bila habis, situs kembali ke kutipan.
// - Domain produksi: mode generatif tidak aktif (status RAG Research Prototype, web/public/js/situs.js).
//   GET melaporkan aktif false dan POST pengunjung ditolak 503 tanpa memanggil Workers AI.
// - Evaluasi: memilih kandidat model, varian prompt, dan alur ({model, varian, alur}) hanya di deploy Preview
//   (bukan domain produksi) dan hanya dengan token OIDC GitHub Actions dari workflow evaluasi
//   repositori ini (server/oidc.js). Tanpa token itu, permintaan ditolak 401.
import { periksaOidc } from "../../server/oidc.js";
import { HOST_PRODUKSI, generatifDiizinkan } from "../../web/public/js/situs.js";
import {
  ALUR, K_PASAL, MODEL_SERVER, MODEL_SERVER_KANDIDAT, VARIAN, VARIAN_SERVER, idfDariIndeks, pasalUntukPrompt, permintaanServer, susunPesan, teksServer,
} from "../../web/public/js/gen/prompt.js";

export { HOST_PRODUKSI };

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
let idf = null;
let pakaiStem = true;

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
  const resIndeks = await env.ASSETS.fetch(new URL("/data/indeks.json", url));
  if (!resIndeks.ok) throw new Error(`indeks: HTTP ${resIndeks.status}`);
  const bm25 = await resIndeks.json();
  idf = idfDariIndeks(bm25);
  pakaiStem = bm25.pakai_stem;
  korpus = await res.json();
  indeks = new Map(korpus.chunk.map((c, i) => [c.id, i]));
}

// Kuota harian gratis habis: Workers AI mengembalikan galat 4006.
const kuotaHabis = (e) => /4006|daily free allocation|neurons/i.test(String(e?.message ?? e));

export function onRequestGet({ request, env }) {
  const host = request ? new URL(request.url).hostname : "";
  const aktif = MODEL_SERVER !== null && generatifDiizinkan(host);
  return json({ aktif, model: aktif ? MODEL_SERVER.id : null, binding: Boolean(env?.AI), alur: ALUR });
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
    if (!generatifDiizinkan(url.hostname)) return json({ galat: "prototipe_riset_tidak_aktif_di_produksi" }, 503);
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
  let alur = ALUR;
  if (badan?.model !== undefined || badan?.varian !== undefined || badan?.alur !== undefined) {
    if (!evaluasi) return json({ galat: "pilihan_model_butuh_evaluasi" }, 403);
    if (badan.model !== undefined) model = MODEL_SERVER_KANDIDAT[badan.model];
    if (badan.varian !== undefined) varian = VARIAN.includes(badan.varian) ? badan.varian : null;
    if (badan.alur !== undefined) alur = ["v1", "v2"].includes(badan.alur) ? badan.alur : null;
    if (!model || !varian || !alur) return json({ galat: "model_atau_varian_tidak_dikenal" }, 400);
  }
  if (!model) return json({ galat: "mode_server_nonaktif" }, 503);
  if (tanya.length < 3 || tanya.length > MAKS_TANYA) return json({ galat: "pertanyaan_tidak_sah" }, 400);
  if (!ids.length || ids.length > K_PASAL || new Set(ids).size !== ids.length) return json({ galat: "pasal_tidak_sah" }, 400);

  await muatKorpus(env, request.url);
  const idx = ids.map((id) => indeks.get(id));
  if (idx.some((i) => i === undefined)) return json({ galat: "pasal_tidak_dikenal" }, 400);

  // Alur v2: pasal panjang diringkas menjadi ayat yang relevan; v1: dipotong dari awal.
  const pasal = pasalUntukPrompt(korpus, idx, alur === "v2" ? { tanya, idf, useStem: pakaiStem } : null);
  const pesan = susunPesan(tanya, pasal, varian);
  try {
    const hasil = await env.AI.run(model.id, permintaanServer(pesan));
    return json({ mentah: teksServer(hasil), model: model.id, varian, alur, pasal: pasal.map((p) => p.id), usage: hasil?.usage ?? null });
  } catch (e) {
    // Rincian galat hanya untuk evaluasi, untuk diagnosis.
    const rinci = evaluasi ? { rinci: String(e?.message ?? e).slice(0, 300) } : {};
    if (kuotaHabis(e)) return json({ galat: "kuota_habis", ...rinci }, 429);
    return json({ galat: "model_gagal", ...rinci }, 502);
  }
}
