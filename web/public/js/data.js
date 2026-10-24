// Memuat korpus, indeks, dan hasil evaluasi. Kemajuan unduhan dilaporkan dari byte sebenarnya.
async function fetchJson(url, onBytes) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.body || !onBytes) return res.json();
  const reader = res.body.getReader();
  const parts = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    onBytes(value.length);
  }
  return JSON.parse(await new Blob(parts).text());
}

export async function loadAll(onProgress) {
  const files = ["data/korpus.json?v=1", "data/indeks.json?v=1", "data/evaluasi.json?v=1"];
  const sizes = await Promise.all(files.map((f) => fetch(f, { method: "HEAD" }).then((r) => Number(r.headers.get("content-length")) || 0).catch(() => 0)));
  const total = sizes.reduce((a, b) => a + b, 0);
  let got = 0;
  const bump = (n) => { got += n; onProgress?.(total ? Math.min(0.99, got / total) : 0); };
  const [korpus, indeks, evaluasi] = await Promise.all(files.map((f) => fetchJson(f, bump)));
  onProgress?.(1);
  return { korpus, indeks, evaluasi };
}
