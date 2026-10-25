// Mode generatif, dua jalur:
// - "server" (utama): jawaban ditulis model Cloudflare Workers AI lewat Pages Function /api/jawab;
//   peramban hanya menjalankan reranker untuk mengurutkan pasal.
// - "lokal" (opsional): model Qwen kecil berjalan di peramban (WebGPU atau CPU) dengan transformers.js.
// Pustaka transformers.js dan runtime ONNX diunduh dari jsDelivr, bobot dari Hugging Face, semuanya
// pada versi yang dipatok dan hanya setelah pengguna menekan tombol muat. Kode pustaka diperiksa
// SHA-256-nya sebelum dijalankan.
import { MODEL, MODEL_CPU, MODEL_SERVER, MAX_TOKEN_BARU } from "./prompt.js";
import { RERANKER, muatReranker, urutUlang as urutDenganReranker } from "./rerank.js";

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

// Ukuran unduhan, dibulatkan: reranker (berkas ONNX dan tokenizer) untuk semua jalur generatif,
// ditambah model generatif untuk jalur lokal (berkas ONNX menurut dtype dan tokenizer).
const RERANKER_MB = RERANKER.berkas ? 160 : 510; // termasuk tokenizer (17 MB) dan runtime ONNX WebAssembly
export const UKURAN_UNDUHAN_MB = { server: RERANKER_MB, webgpu: RERANKER_MB + 1240, wasm: RERANKER_MB + 800 };

let lib = null;
let rr = null;
let genLokal = null;
let perangkatLokal = null;

// Jalur lokal utama: WebGPU dengan shader-f16 dan model 1,5B. Tanpa itu, pengguna dapat memilih
// jalur CPU (WebAssembly) dengan model 0,5B; keduanya dievaluasi dengan prompt yang sama.
export async function periksaDukungan() {
  if (!("gpu" in navigator)) return { ok: false, alasan: "Peramban ini belum mendukung WebGPU." };
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) return { ok: false, alasan: "WebGPU tidak tersedia di perangkat ini." };
  if (!adapter.features.has("shader-f16")) return { ok: false, alasan: "GPU perangkat ini tidak mendukung perhitungan f16 yang dibutuhkan model." };
  return { ok: true };
}

export const serverTersedia = () => MODEL_SERVER !== null;
export const perangkatLokalAktif = () => perangkatLokal;
export function modelUntuk(jalur) {
  if (jalur === "server") return MODEL_SERVER;
  return perangkatLokal === "webgpu" ? MODEL : MODEL_CPU;
}
export function siap(jalur) { return rr !== null && (jalur === "server" ? serverTersedia() : genLokal !== null); }

// Reranker selalu di CPU (WebAssembly), jalur yang paritas skornya dengan evaluasi diuji.
async function siapkanReranker(onProgress) {
  lib ??= await muatPustaka();
  lib.env.allowLocalModels = false;
  if (rr) return;
  try { rr = await muatReranker(lib, "wasm", onProgress); }
  catch (e) { throw new Error(`reranker: ${e.message}`); }
}

// onProgress menerima {file, loaded, total} dari transformers.js.
// jalur "server": hanya reranker. jalur "lokal": model generatif di perangkat ("webgpu" atau
// "wasm") lalu reranker. Dimuat berurutan, bukan bersamaan: di jalur CPU keduanya berbagi satu
// memori WebAssembly, dan memuat keduanya bersamaan, atau reranker lebih dulu, gagal dengan
// bad_alloc pada uji asap CPU.
export async function muatJalur(jalur, perangkat, onProgress) {
  if (jalur === "server" || genLokal) { await siapkanReranker(onProgress); return; }
  const m = perangkat === "webgpu" ? MODEL : MODEL_CPU;
  lib ??= await muatPustaka();
  lib.env.allowLocalModels = false;
  // Model generatif dimuat lebih dulu (urutan yang lolos uji asap CPU); reranker yang sudah dimuat
  // untuk jalur server dilepas dulu dan dimuat ulang dari cache peramban sesudahnya.
  if (rr) { await rr.model.dispose?.(); rr = null; }
  try {
    genLokal = await lib.pipeline("text-generation", m.id, {
      revision: m.revision,
      dtype: m.dtype,
      device: perangkat,
      progress_callback: (p) => { if (p.status === "progress") onProgress?.(p); },
    });
  } catch (e) { throw new Error(`model generatif: ${e.message}`); }
  try { await siapkanReranker(onProgress); }
  catch (e) { await genLokal.dispose?.(); genLokal = null; throw e; }
  perangkatLokal = perangkat;
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

// Jalur lokal: dekode serakah (tanpa sampling), sama seperti evaluasi; onTeks dipanggil untuk
// setiap potongan. Jalur server tidak mengalir per potongan; jawabannya tampil utuh.
export async function bangkitkan(jalur, { tanya, pasal, pesan }, onTeks) {
  if (jalur === "server") return bangkitkanServer(tanya, pasal);
  if (!genLokal) throw new Error("model belum dimuat");
  const streamer = new lib.TextStreamer(genLokal.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => onTeks?.(t) });
  const out = await genLokal(pesan, { max_new_tokens: MAX_TOKEN_BARU, do_sample: false, streamer });
  return out[0].generated_text.at(-1).content;
}
