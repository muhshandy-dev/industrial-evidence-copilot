// Server statis kecil untuk uji. Menerapkan header dari public/_headers agar CSP ikut diuji.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml" };

function globalHeaders() {
  const out = {};
  let inGlobal = false;
  for (const line of readFileSync(join(root, "_headers"), "utf8").split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (!line.startsWith(" ")) { inGlobal = line.trim() === "/*"; continue; }
    if (inGlobal) { const i = line.indexOf(":"); out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  }
  return out;
}

export function startServer(port = 0) {
  const headers = globalHeaders();
  const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = join(root, p);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, headers).end("tidak ditemukan");
      return;
    }
    res.writeHead(200, { ...headers, "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer(Number(process.env.PORT || 8788));
  console.log(`http://127.0.0.1:${s.address().port}`);
}
