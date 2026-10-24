// Percobaan: model dan panjang konteks mana yang dapat dijalankan di CPU peramban
// (WebAssembly)? Prompt dibuat dengan kode situs (susunPesan) dari pasal sungguhan, karena
// prompt pendek lolos sedangkan prompt penuh empat pasal kehabisan memori (bad_alloc).
// Bukan uji regresi; hasilnya dipakai untuk memilih konfigurasi jalur CPU.
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const calon = (process.env.CALON || "onnx-community/Qwen2.5-0.5B-Instruct:q4f16,onnx-community/Qwen2.5-0.5B-Instruct:q4").split(",");
// k:karakter = jumlah pasal dan batas karakter per pasal.
const konteks = (process.env.KONTEKS || "4:1800,3:1200,2:1200,2:800").split(",");
const PASAL = ["permenaker-4-2025#pasal-12", "permenaker-4-2025#pasal-10", "permenaker-4-2025#pasal-19", "permenaker-4-2025#pasal-9"];
const TANYA = "Berapa lama masa berlaku Lisensi K3 operator pesawat uap?";
for (const c of calon) {
  const [id, dtype] = c.split(":");
  for (const kk of konteks) {
    const [k, maks] = kk.split(":").map(Number);
    const page = await browser.newPage();
    page.on("console", (m) => { if (m.type() === "error") console.log(`  [konsol] ${m.text().slice(0, 160)}`); });
    await page.goto(base);
    const hasil = await page.evaluate(async ([id, dtype, k, maks, PASAL, TANYA]) => {
      const { muatPustaka } = await import("/js/gen/runtime.js");
      const { susunPesan, MAX_TOKEN_BARU } = await import("/js/gen/prompt.js");
      const korpus = await (await fetch("/data/korpus.json")).json();
      const pasal = PASAL.slice(0, k).map((pid, i) => {
        const ch = korpus.chunk.find((x) => x.id === pid);
        return { n: i + 1, id: pid, sumber: `${korpus.dokumen[ch.dok].judul}, ${ch.label}`, teks: ch.teks.slice(0, maks) };
      });
      const pesan = susunPesan(TANYA, pasal);
      const lib = await muatPustaka();
      lib.env.allowLocalModels = false;
      const t0 = performance.now();
      try {
        const gen = await lib.pipeline("text-generation", id, { dtype, device: "wasm" });
        const nPrompt = gen.tokenizer.encode(gen.tokenizer.apply_chat_template(pesan, { tokenize: false, add_generation_prompt: true })).length;
        const t1 = performance.now();
        const out = await gen(pesan, { max_new_tokens: MAX_TOKEN_BARU, do_sample: false });
        const t2 = performance.now();
        return { ok: true, token_prompt: nPrompt, jawab_s: ((t2 - t1) / 1000).toFixed(1), teks: out[0].generated_text.at(-1).content.slice(0, 200) };
      } catch (e) {
        return { ok: false, galat: String(e.message || e).slice(0, 200), detik: ((performance.now() - t0) / 1000).toFixed(0) };
      }
    }, [id, dtype, k, maks, PASAL, TANYA]);
    console.log(`${id} ${dtype} ${k}x${maks}:`, JSON.stringify(hasil));
    await page.close();
  }
}
await browser.close();
server.close();
