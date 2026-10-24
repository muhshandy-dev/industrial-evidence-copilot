// Percobaan: model mana yang dapat dimuat dan dijalankan di CPU peramban (WebAssembly)?
// Bukan uji regresi; hasilnya dipakai untuk memilih ukuran model jalur CPU.
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const calon = (process.env.CALON || "onnx-community/Qwen2.5-0.5B-Instruct:q4f16,onnx-community/Qwen2.5-0.5B-Instruct:q4,onnx-community/Qwen2.5-1.5B-Instruct:q4").split(",");
for (const c of calon) {
  const [id, dtype] = c.split(":");
  const page = await browser.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log(`  [konsol] ${m.text().slice(0, 200)}`); });
  await page.goto(base);
  const hasil = await page.evaluate(async ([id, dtype]) => {
    const { muatPustaka } = await import("/js/gen/runtime.js");
    const lib = await muatPustaka();
    lib.env.allowLocalModels = false;
    const t0 = performance.now();
    try {
      const gen = await lib.pipeline("text-generation", id, { dtype, device: "wasm" });
      const t1 = performance.now();
      const out = await gen([{ role: "user", content: "Sebutkan satu alat pelindung diri. Jawab satu kalimat." }], { max_new_tokens: 24, do_sample: false });
      const t2 = performance.now();
      return { ok: true, muat_s: ((t1 - t0) / 1000).toFixed(0), jawab_s: ((t2 - t1) / 1000).toFixed(1), teks: out[0].generated_text.at(-1).content };
    } catch (e) {
      return { ok: false, galat: String(e.message || e).slice(0, 300), muat_s: ((performance.now() - t0) / 1000).toFixed(0) };
    }
  }, [id, dtype]);
  console.log(`${id} ${dtype}:`, JSON.stringify(hasil));
  await page.close();
}
await browser.close();
server.close();
