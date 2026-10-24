// Menjalankan model generatif di peramban (WebGPU) dengan transformers.js.
// Pustaka transformers.js dan runtime ONNX diunduh dari jsDelivr, bobot model dari Hugging Face,
// semuanya pada versi yang dipatok dan hanya setelah pengguna menekan tombol muat. Kode pustaka
// diperiksa SHA-256-nya sebelum dijalankan. Pertanyaan tidak pernah dikirim ke server mana pun.
import { MODEL, MAX_TOKEN_BARU } from "./prompt.js";

// Diperiksa oleh scripts/check-build.mjs terhadap paket npm yang terpasang (versi dan SHA-256).
export const PUSTAKA = {
  versi: "4.3.1",
  url: "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js",
  sha256: "8d6716d9086f57c30a4bf367dba61b887593573c770c454465e8019b2703e743",
};

async function muatPustaka() {
  const res = await fetch(PUSTAKA.url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`pustaka transformers.js: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const hex = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buf))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== PUSTAKA.sha256) throw new Error("pustaka transformers.js tidak cocok dengan sidik yang dipatok; dibatalkan");
  const url = URL.createObjectURL(new Blob([buf], { type: "text/javascript" }));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}

export const UKURAN_UNDUHAN_MB = 1250; // model_q4f16.onnx dan tokenizer, dibulatkan

let lib = null;
let gen = null;

// WebGPU dengan shader-f16 dibutuhkan agar bobot q4f16 yang sama dengan evaluasi dapat dipakai.
export async function periksaDukungan() {
  if (!("gpu" in navigator)) return { ok: false, alasan: "Peramban ini belum mendukung WebGPU." };
  let adapter = null;
  try { adapter = await navigator.gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) return { ok: false, alasan: "WebGPU tidak tersedia di perangkat ini." };
  if (!adapter.features.has("shader-f16")) return { ok: false, alasan: "GPU perangkat ini tidak mendukung perhitungan f16 yang dibutuhkan model." };
  return { ok: true };
}

export function sudahDimuat() { return gen !== null; }

// onProgress menerima {file, loaded, total} dari transformers.js.
export async function muatModel(onProgress) {
  if (gen) return gen;
  lib ??= await muatPustaka();
  lib.env.allowLocalModels = false;
  gen = await lib.pipeline("text-generation", MODEL.id, {
    revision: MODEL.revision,
    dtype: MODEL.dtype,
    device: "webgpu",
    progress_callback: (p) => { if (p.status === "progress") onProgress?.(p); },
  });
  return gen;
}

// Dekode serakah (tanpa sampling), sama seperti evaluasi. onTeks dipanggil untuk setiap potongan.
export async function bangkitkan(pesan, onTeks) {
  if (!gen) throw new Error("model belum dimuat");
  const streamer = new lib.TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => onTeks?.(t) });
  const out = await gen(pesan, { max_new_tokens: MAX_TOKEN_BARU, do_sample: false, streamer });
  return out[0].generated_text.at(-1).content;
}
