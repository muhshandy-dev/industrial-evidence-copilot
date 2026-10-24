// Panel pembaca bukti: menampilkan satu pasal, menyorot ayat yang dikutip, dan mengizinkan menelusuri pasal lain.
import { h, clear } from "./dom.js";
import { splitUnits } from "./answer.js";
import { motionOn } from "./motion.js";

export function createReader(root, corpus) {
  const { dokumen, chunk } = corpus;
  const byDoc = dokumen.map(() => []);
  chunk.forEach((c, i) => byDoc[c.dok].push(i));
  let current = null;

  function empty() {
    clear(root).append(
      h("div", { class: "pembaca-kosong" },
        h("h3", {}, "Belum ada bukti yang dibuka"),
        h("p", {}, "Ajukan pertanyaan lalu pilih kutipan jawaban. Pasal sumbernya akan dibuka di sini lengkap dengan ayat yang dikutip."),
        h("p", { class: "catatan" }, "Anda juga bisa membuka dokumen mana pun dari daftar sumber di sebelah kiri.")),
    );
  }

  // marks: { unitIndex: "baru" | "tetap" }
  function show(chunkIdx, { units = [], scroll = true } = {}) {
    const c = chunk[chunkIdx];
    const doc = dokumen[c.dok];
    const siblings = byDoc[c.dok];
    const pos = siblings.indexOf(chunkIdx);
    const same = current === chunkIdx;
    current = chunkIdx;
    const parts = splitUnits(c.teks);
    const body = h("div", { class: "pasal", id: "pasal-isi", tabindex: "-1" });
    parts.forEach((p, i) => {
      const cited = units.includes(i);
      body.append(h("p", { class: "ayat", data: { unit: i, ...(cited ? { bukti: same || !motionOn() ? "tetap" : "baru" } : {}) } }, p));
    });
    const go = (i) => () => show(siblings[i]);
    clear(root).append(
      h("div", { class: "pembaca-kepala" },
        h("div", { class: "pembaca-doc" }, doc.judul),
        h("h3", { class: "pembaca-judul" }, c.label),
        h("div", { class: "pembaca-bab" }, [c.bab, c.judul_bab].filter(Boolean).join(" · ") || doc.tentang)),
      body,
      h("div", { class: "pembaca-nav" },
        h("button", { type: "button", disabled: pos <= 0, onclick: go(pos - 1) }, "Pasal sebelumnya"),
        h("button", { type: "button", disabled: pos >= siblings.length - 1, onclick: go(pos + 1) }, "Pasal berikutnya")),
      h("div", { class: "pembaca-asal" },
        h("span", {}, `${doc.judul} tentang ${doc.tentang}`),
        doc.url ? h("a", { href: doc.url, rel: "noopener noreferrer", target: "_blank" }, "Buka dokumen resmi (sumber asli)") : null,
        h("span", { class: "ci" }, doc.sha256 ? `SHA-256 berkas: ${doc.sha256.slice(0, 16)}…` : "")),
      h("nav", { class: "daftar-pasal", "aria-label": `Semua pasal ${doc.judul}` },
        siblings.map((ci, i) => h("button", { type: "button", "aria-current": ci === chunkIdx ? "true" : null, "aria-label": chunk[ci].label, onclick: go(i) }, chunk[ci].label.replace(/^Pasal\s*/, "")))),
    );
    const mark = body.querySelector("[data-bukti]");
    if (scroll && mark) mark.scrollIntoView({ block: "center", behavior: motionOn() ? "smooth" : "auto" });
    else if (scroll) root.parentElement?.scrollTo?.({ top: 0 });
  }

  empty();
  return { show, empty, get current() { return current; } };
}
