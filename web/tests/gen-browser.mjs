// Uji asap mode generatif di Chromium sungguhan: CSP mengizinkan unduhan pustaka dan model,
// model termuat lewat WebGPU, lalu satu pertanyaan dijawab dengan kalimat bersitasi atau
// ditolak dengan alasan yang sah. Runner GitHub tidak punya GPU dengan f16, jadi yang diuji di
// sana adalah jalur CPU (WebAssembly); jalur WebGPU perlu diperiksa di perangkat sungguhan.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { startServer } from "./serve.mjs";

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader", "--disable-vulkan-surface"],
});
const page = await browser.newPage();
const galat = [];
page.on("console", (m) => { if (m.type() === "error") galat.push(m.text()); console.log(`[konsol ${m.type()}] ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => galat.push(String(e)));

try {
  await page.goto(base);
  await page.waitForSelector("main[data-ready]", { timeout: 30000 });
  const gpu = await page.evaluate(async () => {
    if (!navigator.gpu) return "navigator.gpu tidak ada";
    const a = await navigator.gpu.requestAdapter();
    return a ? `adapter ada; shader-f16: ${a.features.has("shader-f16")}` : "adapter null";
  });
  console.log("WebGPU:", gpu);
  await page.check("input[name=mode-jawab][value=lokal]");
  await page.waitForFunction(() => (document.querySelector(".mode-status")?.textContent ?? "").length > 0);
  // Runner tanpa GPU f16: pakai jalur CPU (model 0,5B, kuantisasi dan prompt yang sama).
  const tombol = page.locator(".mode-jawab button:visible").first();
  console.log("tombol:", await tombol.textContent());
  await tombol.click();
  const t0Muat = Date.now();
  await page.waitForSelector(".mode-jawab[data-model]", { timeout: 30 * 60 * 1000 });
  const status = await page.textContent(".mode-status");
  console.log(`status setelah ${((Date.now() - t0Muat) / 1000).toFixed(0)} detik:`, status);
  assert.equal(await page.getAttribute(".mode-jawab", "data-model"), "siap");
  const t0 = Date.now();
  // Pertanyaan dev dengan skor jauh di atas ambang (model benar-benar dipanggil) dan reranker
  // mengubah pasal teratas. Urutan yang diharapkan dihitung evaluasi Python dari cache reranker:
  // BM25 saja menaruh permenaker-4-2025#pasal-8 di peringkat 1.
  const HARAP = ["permenaker-8-2020#pasal-153", "permenaker-8-2020#pasal-154", "permenaker-4-2025#pasal-8", "permenaker-8-2020#pasal-148"];
  await page.fill("#pertanyaan", "Berapa usia paling rendah untuk menjadi operator forklift kelas II?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 30 * 60 * 1000 });
  console.log(`dijawab dalam ${((Date.now() - t0) / 1000).toFixed(0)} detik`);
  const kepala = await page.textContent(".jawaban-kepala");
  console.log("kepala:", kepala);
  console.log("isi:", (await page.textContent(".jawaban")).slice(0, 800));
  const mode = await page.getAttribute(".jawaban[data-selesai=ya]", "data-mode");
  console.log("mode:", mode);
  const peringkat = (await page.getAttribute(".jawaban[data-selesai=ya]", "data-peringkat") ?? "").split(" ");
  console.log("pasal untuk model:", peringkat.join(", "));
  assert.deepEqual(peringkat, HARAP, "urutan reranker di peramban berbeda dari evaluasi");
  // Model harus benar-benar berjalan: bukan ditolak gerbang dan bukan galat model.
  assert.ok(["generatif", "tolak_model", "cadangan_ekstraktif"].includes(mode), `mode ${mode}`);
  if (mode === "generatif") assert.ok(await page.locator(".gen-kalimat .gen-sitasi").count() >= 1, "kalimat generatif tanpa sitasi");
  assert.deepEqual(galat.filter((g) => /Content Security Policy|Refused to/.test(g)), [], "pelanggaran CSP");
  console.log("uji asap peramban generatif lolos");
} finally {
  await browser.close();
  server.close();
}
