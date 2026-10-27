// Pemeriksaan sebelum deploy: data nyata ada dan konsisten, tidak ada skrip atau gaya sebaris,
// tidak ada permintaan ke pihak ketiga. Gagal dengan kode keluar 1 bila ada masalah.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const masalah = [];
const cek = (ok, pesan) => { if (!ok) masalah.push(pesan); };
const baca = (p) => readFileSync(join(root, p), "utf8");

// 1. Data
for (const f of ["korpus", "indeks", "evaluasi"]) cek(existsSync(join(root, `data/${f}.json`)), `data/${f}.json tidak ada`);
if (!masalah.length) {
  const korpus = JSON.parse(baca("data/korpus.json"));
  const indeks = JSON.parse(baca("data/indeks.json"));
  const ev = JSON.parse(baca("data/evaluasi.json"));
  cek(korpus.asal === "nyata", `korpus.asal harus "nyata", bukan "${korpus.asal}"`);
  cek(korpus.dokumen.length >= 10 && korpus.chunk.length >= 400, "korpus terlalu kecil untuk korpus nyata");
  for (const d of korpus.dokumen) cek(/^[0-9a-f]{64}$/.test(d.sha256) && d.url?.startsWith("https://jdih.kemnaker.go.id/"), `dokumen ${d.id}: sumber atau SHA-256 tidak valid`);
  cek(indeks.n === korpus.chunk.length, "indeks tidak sesuai jumlah pasal di korpus");
  cek(typeof ev.ambang_jawab === "number" && ev.jawaban?.test && ev.pencarian?.per_sistem, "evaluasi.json tidak lengkap");
  cek(ev.korpus?.sha256 && ev.pertanyaan?.sha256, "evaluasi.json tanpa sidik korpus dan pertanyaan");
}

// 2. HTML: tanpa skrip/gaya sebaris, tanpa penangan peristiwa sebaris, tanpa sumber luar
const html = baca("index.html");
cek(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "ada <script> sebaris");
cek(!/<style[\s>]/i.test(html), "ada <style> sebaris");
cek(!/\sstyle\s*=/i.test(html), "ada atribut style sebaris");
cek(!/\son[a-z]+\s*=/i.test(html), "ada penangan peristiwa sebaris");
cek(!/(src|href)\s*=\s*["']https?:/i.test(html), "ada sumber eksternal di index.html");
cek(/<html[^>]*lang="id"/.test(html), "lang=id hilang");

// 3. JS dan CSS: tanpa URL luar, tanpa innerHTML/eval
const semua = (dir) => readdirSync(join(root, dir), { recursive: true }).map((f) => `${dir}/${f}`).filter((f) => statSync(join(root, f)).isFile());
for (const f of [...semua("js"), ...semua("css")]) {
  const s = baca(f);
  const tanpaKomentar = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  cek(!/\b(fetch|import|url)\(\s*["'`]https?:/.test(tanpaKomentar), `${f}: permintaan ke pihak ketiga`);
  const luar = [...tanpaKomentar.matchAll(/["'`](https?:\/\/[^"'`\s]+)/g)].map((m) => m[1]).filter((u) => !u.startsWith("https://jdih.kemnaker.go.id"));
  cek(f === "js/gen/runtime.js" ? luar.every((u) => u.startsWith("https://cdn.jsdelivr.net/npm/@huggingface/transformers@")) : !luar.some((u) => /^https?:\/\/[^/]+\.(js|mjs|wasm)/.test(u)), `${f}: URL luar tidak diizinkan`);
  if (f.endsWith(".js")) {
    cek(!/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\(|new Function\(|document\.write/.test(tanpaKomentar), `${f}: pola tidak aman (innerHTML/eval)`);
    cek(!/\.style\.cssText|setAttribute\(\s*["']style["']/.test(tanpaKomentar), `${f}: gaya sebaris lewat atribut (melanggar CSP)`);
  }
}

// 3b. Pustaka transformers.js yang dimuat situs: versi dan SHA-256 harus sama dengan paket npm.
{
  const rt = baca("js/gen/runtime.js");
  const versi = rt.match(/versi: "([^"]+)"/)?.[1];
  const sha = rt.match(/sha256: "([0-9a-f]{64})"/)?.[1];
  const pkg = JSON.parse(readFileSync(join(root, "..", "node_modules", "@huggingface", "transformers", "package.json"), "utf8"));
  const asli = readFileSync(join(root, "..", "node_modules", "@huggingface", "transformers", "dist", "transformers.min.js"));
  cek(versi === pkg.version, `runtime.js memakai transformers.js ${versi}, paket terpasang ${pkg.version}`);
  cek(sha === createHash("sha256").update(asli).digest("hex"), "SHA-256 transformers.js di runtime.js tidak sama dengan paket npm");
  cek(rt.includes(`@huggingface/transformers@${pkg.version}/dist/transformers.min.js`), "URL pustaka tidak memakai versi terpasang");
}

// 4. Header
const hd = baca("_headers");
cek(/Content-Security-Policy:.*default-src 'none'/.test(hd), "CSP default-src 'none' hilang");
cek(!/'unsafe-inline'|'unsafe-eval'/.test(hd), "CSP memakai 'unsafe-inline' atau 'unsafe-eval'");
// Pihak ketiga hanya untuk mode generatif yang diaktifkan pengguna; daftar ini dikunci.
cek(/script-src 'self' 'wasm-unsafe-eval' blob: https:\/\/cdn\.jsdelivr\.net;/.test(hd), "CSP script-src berbeda dari yang diizinkan");
cek(/connect-src 'self' https:\/\/cdn\.jsdelivr\.net https:\/\/huggingface\.co https:\/\/\*\.huggingface\.co https:\/\/\*\.hf\.co;/.test(hd), "CSP connect-src berbeda dari yang diizinkan");

// 5. Berkas yang dirujuk index.html ada
for (const m of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
  if (!/^(https?:|mailto:)/.test(m[1])) cek(existsSync(join(root, m[1])), `index.html merujuk berkas yang tidak ada: ${m[1]}`);
}

if (masalah.length) {
  console.error(masalah.map((m) => `x ${m}`).join("\n"));
  process.exit(1);
}
console.log("check-build: semua pemeriksaan lolos");
