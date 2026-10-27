import { h, clear } from "./dom.js";
import { loadAll } from "./data.js";
import { mountWorkspace } from "./workspace.js";
import { mountEvaluation } from "./evaluation.js";
import { mountMethod } from "./method.js";
import "./motion.js";

import { generatifDiizinkan } from "./situs.js";

const main = document.getElementById("utama");
// Di luar domain produksi (Preview, lokal) mode generatif prototipe riset dapat dipilih.
if (generatifDiizinkan(location.hostname)) {
  document.getElementById("mode-tip").textContent = "Bawaannya, kalimat jawaban disalin persis dari pasal dan pencarian berjalan di peramban Anda. Ini deploy riset: mode generatif (prototipe, belum lolos evaluasi akhir) dapat dipilih di panel Sumber. Mode generatif server mengirim pertanyaan dan nomor pasal ke Cloudflare Workers AI.";
}
let data = null;
let loading = null;

document.getElementById("tema").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "gelap" ? "terang" : "gelap";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("tema", next); } catch { /* penyimpanan dinonaktifkan */ }
});

function setProgress(p) {
  const fill = document.getElementById("memuat-isi");
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
}

async function ensureData() {
  if (data) return data;
  loading ??= loadAll(setProgress).then((d) => (data = d));
  return loading;
}

const ROUTES = {
  "": ["ruang", mountWorkspace, "Ruang kerja"],
  "evaluasi": ["evaluasi", mountEvaluation, "Evaluasi"],
  "metode": ["metode", mountMethod, "Cara kerja dan batas"],
};

async function route() {
  const key = location.hash.replace(/^#\/?/, "");
  const [id, mount, title] = ROUTES[key] ?? ROUTES[""];
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  document.title = `${title} | Industrial Evidence Copilot`;
  try {
    const d = await ensureData();
    delete main.dataset.ready;
    mount(main, d);
    if (key) main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    clear(main).append(h("div", { class: "memuat", role: "alert" },
      h("p", {}, "Data tidak dapat dimuat. Periksa koneksi lalu coba lagi."),
      h("p", { class: "catatan" }, String(err.stack || err.message)),
      h("button", { class: "tombol tombol-pelan", type: "button", onclick: () => { loading = null; route(); } }, "Coba lagi")));
  }
}

addEventListener("hashchange", route);
route();
