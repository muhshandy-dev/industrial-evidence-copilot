// Uji asap mode generatif di Chromium sungguhan: CSP mengizinkan unduhan pustaka dan model,
// model termuat lewat WebGPU, lalu satu pertanyaan dijawab dengan kalimat bersitasi atau
// ditolak dengan alasan yang sah. Butuh internet dan GPU (atau WebGPU perangkat lunak), jadi
// dijalankan di workflow terpisah, bukan di CI biasa.
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
  await page.check("input[name=mode-jawab][value=generatif]");
  await page.waitForFunction(() => (document.querySelector(".mode-status")?.textContent ?? "").length > 0);
  const tombol = page.locator(".mode-jawab button");
  if (!(await tombol.isVisible())) {
    throw new Error(`mode generatif tidak tersedia di runner: ${await page.textContent(".mode-status")}`);
  }
  await tombol.click();
  await page.waitForFunction(() => /Model siap|gagal dimuat/.test(document.querySelector(".mode-status")?.textContent ?? ""), null, { timeout: 30 * 60 * 1000 });
  const status = await page.textContent(".mode-status");
  console.log("status:", status);
  assert.match(status, /Model siap/);
  const t0 = Date.now();
  await page.fill("#pertanyaan", "Berapa lama batas waktu pengurus melaporkan kecelakaan kerja?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 30 * 60 * 1000 });
  console.log(`dijawab dalam ${((Date.now() - t0) / 1000).toFixed(0)} detik`);
  const kepala = await page.textContent(".jawaban-kepala");
  console.log("kepala:", kepala);
  console.log("isi:", (await page.textContent(".jawaban")).slice(0, 800));
  assert.match(kepala, /Jawaban generatif|Tidak menjawab|Kutipan cadangan/);
  if (/Jawaban generatif/.test(kepala)) assert.ok(await page.locator(".gen-kalimat .gen-sitasi").count() >= 1, "kalimat generatif tanpa sitasi");
  assert.deepEqual(galat.filter((g) => /Content Security Policy|Refused to/.test(g)), [], "pelanggaran CSP");
  console.log("uji asap peramban generatif lolos");
} finally {
  await browser.close();
  server.close();
}
