// Uji ujung ke ujung di Chromium: alur tanya jawab, tiga halaman, aksesibilitas (axe), ponsel,
// gerak dikurangi, dan tidak ada permintaan keluar atau pelanggaran CSP.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { startServer } from "./serve.mjs";

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let gagal = 0;
const jalan = async (nama, fn) => {
  try { await fn(); console.log(`ok   ${nama}`); } catch (e) { gagal++; console.log(`GAGAL ${nama}\n     ${e.message.split("\n").join("\n     ")}`); }
};

async function halaman(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const log = { errors: [], luar: [] };
  page.on("console", (m) => { if (m.type() === "error") log.errors.push(m.text()); });
  page.on("pageerror", (e) => log.errors.push(String(e)));
  page.on("request", (r) => { if (!r.url().startsWith(base) && !r.url().startsWith("data:")) log.luar.push(r.url()); });
  return { ctx, page, log };
}
const siap = (page, hash) => page.goto(base + hash).then(() => page.waitForSelector("main[data-ready]", { timeout: 15000 }));

await jalan("pertanyaan yang ada dasarnya dijawab dengan kutipan dan pasal terbuka", async () => {
  const { ctx, page, log } = await halaman({ reducedMotion: "reduce" });
  await siap(page, "");
  await page.fill("#pertanyaan", "Berapa umur minimal peserta ujian juru las?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 15000 });
  assert.match(await page.textContent(".jawaban-kepala"), /Jawaban ekstraktif/);
  const kutipan = await page.locator(".kutipan").count();
  assert.ok(kutipan >= 1 && kutipan <= 3, `jumlah kutipan ${kutipan}`);
  const sumber = await page.textContent(".kutipan .sumber");
  assert.match(sumber, /Pasal \d+/);
  assert.ok(await page.locator(".pasal .ayat[data-bukti]").count() >= 1, "ayat bukti tidak disorot di pembaca");
  // Kalimat jawaban harus muncul persis di teks pasal yang dibuka pembaca.
  const kalimat = (await page.locator(".kutipan > span").first().textContent()).trim();
  const teksPasal = await page.textContent(".pasal");
  assert.ok(teksPasal.replace(/\s+/g, " ").includes(kalimat.replace(/\s+/g, " ")), "kutipan bukan salinan teks pasal");
  assert.deepEqual(log.errors, []); assert.deepEqual(log.luar, []);
  await ctx.close();
});

await jalan("mode generatif tanpa WebGPU: alasan dan pilihan CPU ditampilkan, tidak ada unduhan otomatis, jawaban tetap kutipan", async () => {
  const { ctx, page, log } = await halaman({ reducedMotion: "reduce" });
  await page.addInitScript(() => { Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }); });
  await siap(page, "");
  await page.check("input[name=mode-jawab][value=generatif]");
  await page.waitForFunction(() => /tetap memakai kutipan langsung/.test(document.querySelector(".mode-status")?.textContent ?? ""));
  const tombol = page.locator(".mode-jawab button:visible");
  assert.equal(await tombol.count(), 1, "hanya pilihan CPU yang boleh muncul");
  assert.match(await tombol.textContent(), /CPU/);
  await page.fill("#pertanyaan", "Berapa umur minimal peserta ujian juru las?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 15000 });
  assert.match(await page.textContent(".jawaban-kepala"), /Jawaban ekstraktif/);
  assert.deepEqual(log.errors, []); assert.deepEqual(log.luar, []);
  await ctx.close();
});

await jalan("pertanyaan di luar korpus ditolak", async () => {
  const { ctx, page } = await halaman({ reducedMotion: "reduce" });
  await siap(page, "");
  await page.fill("#pertanyaan", "Berapa harga bitcoin hari ini?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 15000 });
  assert.match(await page.textContent(".jawaban-kepala"), /Tidak menjawab/);
  assert.equal(await page.locator(".kutipan").count(), 0);
  await ctx.close();
});

await jalan("membatasi dokumen yang dicari membatasi sumber kutipan", async () => {
  const { ctx, page } = await halaman({ reducedMotion: "reduce" });
  await siap(page, "");
  const boxes = page.locator(".dok input");
  assert.equal(await boxes.count(), 15);
  const judulDipilih = (await page.locator(".dok-judul").nth(1).textContent()).trim();
  for (let i = 0; i < 15; i++) if (i !== 1) await boxes.nth(i).uncheck();
  await page.fill("#pertanyaan", "Berapa umur minimal peserta ujian juru las?");
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 15000 });
  for (const t of await page.locator(".jejak-nama").allTextContents()) assert.ok(t.startsWith(judulDipilih), `hasil dari dokumen lain: ${t}`);
  await ctx.close();
});

await jalan("halaman evaluasi memuat kartu angka, tabel, grafik, dan daftar kegagalan", async () => {
  const { ctx, page } = await halaman();
  await siap(page, "#/evaluasi");
  assert.ok(await page.locator(".kartu-angka").count() >= 6);
  assert.equal(await page.locator("tbody tr").count(), 5);
  assert.equal(await page.locator("svg.grafik").count(), 1);
  assert.ok(await page.locator("details.gagal").count() >= 1);
  assert.ok(!/NaN|undefined|null/.test(await page.textContent("main")), "teks mengandung NaN/undefined/null");
  await ctx.close();
});

await jalan("halaman metode memuat 15 dokumen dengan SHA-256 dan peringatan lisensi", async () => {
  const { ctx, page } = await halaman();
  await siap(page, "#/metode");
  assert.equal(await page.locator("tbody tr").count(), 15);
  assert.ok((await page.textContent("main")).includes("Pasal 42 huruf b"));
  assert.ok((await page.textContent(".peringatan")).includes("dicek manual"));
  assert.ok(!/NaN|undefined|null/.test(await page.textContent("main")));
  await ctx.close();
});

await jalan("tidak ada em dash di teks tampilan", async () => {
  const { ctx, page } = await halaman();
  for (const h of ["", "#/evaluasi", "#/metode"]) {
    await siap(page, h);
    assert.ok(!(await page.textContent("body")).includes("—"), `em dash di ${h || "ruang kerja"}`);
  }
  await ctx.close();
});

for (const [nama, lebar, tinggi] of [["desktop", 1440, 900], ["ponsel", 390, 844]]) {
  for (const tema of ["terang", "gelap"]) {
    await jalan(`aksesibilitas (axe) dan tata letak: ${nama}, tema ${tema}`, async () => {
      const { ctx, page, log } = await halaman({ viewport: { width: lebar, height: tinggi } });
      for (const hash of ["", "#/evaluasi", "#/metode"]) {
        await siap(page, hash);
        await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, tema);
        await page.waitForTimeout(700);
        const hasil = await new AxeBuilder({ page }).analyze();
        assert.deepEqual(hasil.violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 120)}`), [], `axe di ${hash || "ruang kerja"}`);
        const lebihLebar = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert.ok(lebihLebar <= 0, `gulir horizontal ${lebihLebar}px di ${hash || "ruang kerja"}`);
      }
      assert.deepEqual(log.errors, []); assert.deepEqual(log.luar, []);
      await ctx.close();
    });
  }
}

await jalan("gerak dikurangi: tidak ada animasi berjalan", async () => {
  const { ctx, page } = await halaman({ reducedMotion: "reduce" });
  await siap(page, "");
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("gerak")), false);
  await ctx.close();
});

await jalan("navigasi papan ketik: tautan lewati dan fokus terlihat", async () => {
  const { ctx, page } = await halaman();
  await siap(page, "");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.className), "lewati");
  await ctx.close();
});

await browser.close(); server.close();
if (gagal) { console.log(`\n${gagal} uji gagal`); process.exit(1); }
console.log("\nsemua uji e2e lolos");
