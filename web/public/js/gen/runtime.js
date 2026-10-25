// Mode generatif. Bila MODEL_SERVER dipilih, jawaban ditulis model di Cloudflare Workers AI lewat
// Pages Function /api/jawab, dan peramban hanya menjalankan reranker. Bila belum, model generatif
// kecil berjalan di peramban (WebGPU atau CPU) dengan transformers.js.
// Pustaka transformers.js dan runtime ONNX diunduh dari jsDelivr, bobot dari Hugging Face, semuanya
// pada versi yang dipatok dan hanya setelah pengguna menekan tombol muat. Kode pustaka diperiksa
// SHA-256-nya sebelum dijalankan.
import { MODEL, MODEL_CPU, MODEL_SERVER, MAX_TOKEN_BARU } from "./prompt.js";
import { muatReranker, urutUlang as urutDenganReranker } from "./rerank.js";

// Diperiksa oleh scripts/check-build.mjs terhadap paket npm yang terpasang (versi dan SHA-256).
export const PUSTAKA = {
  versi: "4.3.1",
  url: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js",
  sha256: "8d6716d9086f57c30a4bf367dba61b887593573c770c454465e8019b2703e743",
};

export async function muatPustaka() {
  const res = await fetch(PUSTAKA.url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`pustaka transformers.js: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== PUSTAKA.sha256) throw new Error("pustaka transformers.js tidak cocok dengan sidik yang dipatok; dibatalkan");
  const url = URL.createObjectURL(new Blob([buf], { type: "text/javascript" }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

// Ukuran unduhan per jalur, dibulatkan: model generatif (berkas ONNX menurut dtype dan
// tokenizer) ditambah reranker fp32 (sekitar 490 MB).
export const UKURAN_UNDUHAN_MB = { webgpu: 1730, wasm: 1290, server: 500 };

let lib = null;
let gen = null;
let rr = null;

// Jalur utama: WebGPU dengan shader-f16 dan model 1,5B. Tanpa itu, pengguna dapat memilih jalur
// CPU (WebAssembly) dengan model 0,5B; keduanya dievaluasi dengan prompt yang sama.
export async function periksaDukungan() {
  if (!("gpu" in navigator)) return { ok: false, alasan: "Peramban ini belum mendukung WebGPU." };
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) return { ok: false, alasan: "WebGPU tidak tersedia di perangkat ini." };
  if (!adapter.features.has("shader-f16")) return { ok: false, alasan: "GPU perangkat ini tidak mendukung perhitungan f16 yang dibutuhkan model." };
  return { ok: true };
}

let perangkatDipakai = null;
export function perangkatAktif() { return perangkatDipakai; }
export function modelUntuk(perangkat) { return perangkat === "server" ? MODEL_SERVER : perangkat === "webgpu" ? MODEL : MODEL_CPU; }

export function sudahDimuat() { return gen !== null; }

// Jalur server: generator adalah Pages Function. Reranker tetap di peramban di CPU (WebAssembly),
// jalur yang paritas skornya dengan evaluasi sudah diuji.
const generatorServer = { server: true };

// onProgress menerima {file, loaded, total} dari transformers.js.
// perangkat: "webgpu" atau "wasm" (CPU).
export async function muatModel(perangkat, onProgress) {
  if (gen) return gen;
  lib ??= await muatPustaka();
  lib.env.allowLocalModels = false;
  if (perangkat === "server") {
    try { rr = await muatReranker(lib, "wasm", onProgress); }
    catch (e) { throw new Error(`reranker: ${e.message}`); }
    gen = generatorServer;
    perangkatDipakai = "server";
    return gen;
  }
  const m = modelUntuk(perangkat);
  // Dimuat berurutan, bukan bersamaan: di jalur CPU kedua sesi berbagi satu memori
  // WebAssembly, dan memuat keduanya bersamaan gagal dengan bad_alloc pada uji asap CPU.
  let g, r;
  try {
    g = await lib.pipeline("text-generation", m.id, {
      revision: m.revision,
      dtype: m.dtype,
      device: perangkat,
      progress_callback: (p) => { if (p.status === "progress") onProgress?.(p); },
    });
  } catch (e) { throw new Error(`model generatif: ${e.message}`); }
  try { r = await muatReranker(lib, perangkat, onProgress); }
  catch (e) { await g.dispose?.(); throw new Error(`reranker: ${e.message}`); }
  rr = r;
  gen = g;
  perangkatDipakai = perangkat;
  return gen;
}

// Urutan pasal untuk model generatif: 20 teratas BM25 dinilai ulang oleh reranker.
export async function urutUlang(korpus, tanya, ranked) {
  if (!rr) throw new Error("reranker belum dimuat");
  return urutDenganReranker(rr, korpus, tanya, ranked);
}

// Galat yang punya pesan untuk pengguna (misalnya kuota harian habis).
export class GalatServer extends Error {}

const PESAN_SERVER = {
  kuota_habis: "Kuota harian gratis model server sudah habis. Kuota terisi lagi pukul 07.00 WIB.",
  mode_server_nonaktif: "Mode server belum diaktifkan di situs ini.",
  binding_ai_belum_dipasang: "Server belum tersambung ke Workers AI.",
};

async function bangkitkanServer(tanya, pasal) {
  let res;
  try {
    res = await fetch("/api/jawab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tanya, pasal: pasal.map((p) => p.id) }),
    });
  } catch { throw new GalatServer("Server tidak dapat dihubungi."); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new GalatServer(PESAN_SERVER[j.galat] ?? `Server menjawab dengan galat (HTTP ${res.status}).`);
  return j.mentah;
}

// Dekode serakah (tanpa sampling), sama seperti evaluasi. onTeks dipanggil untuk setiap potongan.
// Jalur server tidak mengalir per potongan; jawabannya tampil utuh.
export async function bangkitkan({ tanya, pasal, pesan }, onTeks) {
  if (!gen) throw new Error("model belum dimuat");
  if (gen.server) return bangkitkanServer(tanya, pasal);
  const streamer = new lib.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => onTeks?.(t) });
  const out = await gen(pesan, { max_new_tokens: MAX_TOKEN_BARU, do_sample: false, streamer });
  return out[0].generated_text.at(-1).content;
}
