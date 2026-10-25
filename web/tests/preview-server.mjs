// Uji asap mode generatif utama di deploy Preview sungguhan (Pages Function + binding Workers AI):
// - perlindungan fungsi: tanpa Origin ditolak, pilihan model tanpa token OIDC ditolak;
// - alur peramban: pilih mode server, muat reranker, satu pertanyaan dijawab model server dengan
//   sitasi yang sah, tanpa pelanggaran CSP.
// Memakai satu atau dua panggilan dari kuota gratis harian. Dilewati selama MODEL_SERVER null.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { MODEL_SERVER } from "../public/js/gen/prompt.js";

const BASE = (process.env.PREVIEW_URL ?? "https://claude-project-thread-8fnhl3.industrial-evidence-copilot.pages.dev").replace(/\/$/, "");
if (!MODEL_SERVER) { console.log("MODEL_SERVER belum dipilih; uji Preview dilewati"); process.exit(0); }

// Tunggu deploy Preview memakai model yang sama dengan kode ini (paling lama 10 menit).
for (let i = 0; ; i++) {
  const j = await fetch(`${BASE}/api/jawab`).then((r) => r.json()).catch(() => ({}));
  if (j.model === MODEL_SERVER.id && j.binding) break;
  if (i >= 20) throw new Error(`Preview belum memakai ${MODEL_SERVER.id}: ${JSON.stringify(j)}`);
  await new Promise((r) => setTimeout(r, 30000));
}

const tanya = "Berapa jarak maksimum antar detektor panas di koridor?";
const pasal = ["permenaker-2-1983#pasal-61"];
const post = (headers, badan) => fetch(`${BASE}/api/jawab`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(badan) });
assert.equal((await post({}, { tanya, pasal })).status, 403, "permintaan tanpa Origin harus ditolak");
assert.equal((await post({ origin: BASE }, { tanya, pasal, model: "llama-4-scout" })).status, 403, "pilihan model tanpa token harus ditolak");
assert.equal((await post({ authorization: "Bearer a.b.c" }, { tanya, pasal, model: "llama-4-scout" })).status, 401, "token palsu harus ditolak");
console.log("perlindungan fungsi lolos");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const galat = [];
page.on("console", (m) => { if (m.type() === "error") galat.push(m.text()); });
page.on("pageerror", (e) => galat.push(String(e)));
// Catat jawaban /api/jawab supaya kegagalan bisa didiagnosis dari log.
const jawabApi = [];
page.on("response", async (r) => {
  if (!r.url().endsWith("/api/jawab") || r.request().method() !== "POST") return;
  const badan = await r.text().catch(() => "");
  jawabApi.push(`${r.status()} ${badan.slice(0, 300)}`);
});
try {
  const res = await page.goto(`${BASE}/`);
  assert.ok(res.headers()["content-security-policy"], "header CSP tidak ada");
  await page.waitForSelector("main[data-ready]", { timeout: 30000 });
  await page.check("input[name=mode-jawab][value=server]");
  await page.locator(".mode-jawab button:visible").first().click();
  await page.waitForSelector(".mode-jawab[data-model]", { timeout: 15 * 60 * 1000 });
  assert.equal(await page.getAttribute(".mode-jawab", "data-model"), "siap");
  await page.fill("#pertanyaan", tanya);
  await page.press("#pertanyaan", "Enter");
  await page.waitForSelector(".jawaban[data-selesai=ya]", { timeout: 120000 });
  const mode = await page.getAttribute(".jawaban[data-selesai=ya]", "data-mode");
  const isi = (await page.textContent(".jawaban")).slice(0, 600);
  console.log("mode:", mode, "\nkepala:", await page.textContent(".jawaban-kepala"), "\nisi:", isi);
  console.log("pesan:", await page.locator(".gen-tunggu").textContent().catch(() => "-"));
  console.log("POST /api/jawab:", jawabApi.join(" | ") || "tidak ada");
  assert.equal(mode, "generatif", "pertanyaan yang jelas terjawab harus dijawab model server");
  assert.equal(await page.getAttribute(".jawaban[data-selesai=ya]", "data-jalur"), "server");
  assert.ok(await page.locator(".gen-kalimat .gen-sitasi").count() >= 1, "kalimat tanpa sitasi");
  assert.match(isi, /10 m/);
  assert.deepEqual(galat.filter((g) => /Content Security Policy|Refused to/.test(g)), [], "pelanggaran CSP");
  console.log("uji Preview mode server lolos");
} finally {
  await browser.close();
}
