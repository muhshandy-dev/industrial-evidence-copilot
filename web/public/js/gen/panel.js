// Pilihan mode jawaban di ruang kerja:
// - Kutipan langsung: bawaan, tanpa unduhan, juga cadangan bila mode generatif gagal.
// - Generatif lewat Cloudflare Workers AI (eksperimental sampai lolos holdout v2, lihat
//   docs/penilaian-v2.md): peramban hanya memuat reranker; model bahasa berjalan di server.
// - Generatif di perangkat (opsional): model Qwen kecil berjalan di peramban.
// Unduhan hanya terjadi setelah pengguna menekan tombol muat.
import { h } from "../dom.js";
import { MODEL, MODEL_CPU, MODEL_SERVER } from "./prompt.js";
import { UKURAN_UNDUHAN_MB, muatJalur, periksaDukungan, serverTersedia, siap } from "./runtime.js";

const nama = (m) => m.id.split("/").at(-1);
const mb = (b) => Math.round(b / 1e6).toLocaleString("id-ID");
const ukuran = (k) => `sekitar ${UKURAN_UNDUHAN_MB[k].toLocaleString("id-ID")} MB`;

export function createModePanel() {
  let mode = "kutipan";
  const status = h("p", { class: "mode-status", role: "status" });
  const batang = h("span", { class: "mode-batang-isi" });
  const kemajuan = h("div", { class: "mode-batang", hidden: true, "aria-hidden": "true" }, batang);
  const tombolServer = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: () => muat("server", "wasm") }, `Muat reranker (${ukuran("server")})`);
  const tombolGpu = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: () => muat("lokal", "webgpu") }, `Muat model di GPU (${ukuran("webgpu")})`);
  const tombolCpu = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: () => muat("lokal", "wasm") }, `Pakai model kecil di CPU (${ukuran("wasm")}, lambat)`);
  const tombol = [tombolServer, tombolGpu, tombolCpu];
  const pilih = (nilai, label, ket) => h("label", { class: "mode-pilih" },
    h("input", { type: "radio", name: "mode-jawab", value: nilai, checked: nilai === "kutipan", onchange: () => ganti(nilai) }),
    h("span", {}, h("strong", {}, label), h("span", { class: "catatan" }, ket)));
  const el = h("fieldset", { class: "mode-jawab" },
    h("legend", { class: "subjudul" }, "Mode jawaban"),
    pilih("kutipan", "Kutipan langsung", "Kalimat disalin persis dari pasal. Cepat, tanpa unduhan model."),
    serverTersedia()
      ? pilih("server", "Generatif dengan model server (eksperimental)", `Model bahasa ${MODEL_SERVER.nama} di Cloudflare Workers AI menulis jawaban singkat dengan sitasi [n] ke pasal. Peramban hanya mengunduh reranker untuk mengurutkan pasal. Mode ini masih diuji; kutipan langsung tetap mode utama.`)
      : null,
    pilih("lokal", "Generatif di perangkat Anda (eksperimental)",
      `Model kecil ${nama(MODEL)} di GPU (WebGPU), atau ${nama(MODEL_CPU)} di CPU, berjalan di peramban Anda. Unduhan besar dan hasilnya lebih lemah${serverTersedia() ? " daripada model server" : ""}.`),
    ...tombol, kemajuan, status);

  const SERVER_INFO = "Peramban mengunduh reranker dari Hugging Face dan pustakanya dari jsDelivr, sekali saja, untuk mengurutkan pasal. Setelah itu pertanyaan Anda dan nomor empat pasal teratas dikirim ke server situs ini, yang meneruskannya ke Workers AI. Kuota gratisnya terbatas per hari; bila habis, jawaban kembali ke kutipan langsung.";
  const LOKAL_INFO = "Bobot model diunduh dari Hugging Face dan pustakanya dari jsDelivr, sekali saja, lalu disimpan di peramban. Pertanyaan Anda tetap diproses di perangkat ini.";

  async function ganti(nilai) {
    mode = nilai;
    el.dataset.mode = nilai;
    for (const t of tombol) t.hidden = true;
    status.textContent = "";
    if (nilai === "kutipan") return;
    if (siap(nilai)) { status.textContent = "Model siap. Pertanyaan berikutnya dijawab secara generatif."; return; }
    if (nilai === "server") {
      tombolServer.hidden = false;
      status.textContent = SERVER_INFO;
      return;
    }
    const d = await periksaDukungan();
    if (mode !== nilai) return;
    if (!d.ok) {
      tombolCpu.hidden = false;
      status.textContent = `${d.alasan} Jawaban tetap memakai kutipan langsung. Sebagai gantinya, model yang lebih kecil (${nama(MODEL_CPU)}) bisa dijalankan di CPU. Hasilnya lebih lemah dan satu jawaban dapat memakan beberapa menit; angkanya dilaporkan terpisah di halaman Evaluasi. ${LOKAL_INFO}`;
      return;
    }
    tombolGpu.hidden = false;
    status.textContent = LOKAL_INFO;
  }

  async function muat(jalur, perangkat) {
    for (const t of tombol) t.disabled = true;
    kemajuan.hidden = false;
    const per = new Map();
    status.textContent = "Mengunduh model…";
    try {
      await muatJalur(jalur, perangkat, (p) => {
        per.set(p.file, [p.loaded, p.total]);
        const [a, b] = [...per.values()].reduce(([x, y], [l, t]) => [x + l, y + t], [0, 0]);
        batang.style.width = `${b ? Math.round((a / b) * 100) : 0}%`;
        status.textContent = `Mengunduh model: ${mb(a)} dari ${mb(b)} MB`;
      });
      for (const t of tombol) { t.hidden = true; t.disabled = false; }
      kemajuan.hidden = true;
      el.dataset.model = "siap";
      status.textContent = perangkat === "wasm" && jalur === "lokal"
        ? `Model ${nama(MODEL_CPU)} siap di CPU. Pertanyaan berikutnya dijawab secara generatif; mohon bersabar, prosesnya lambat.`
        : "Model siap. Pertanyaan berikutnya dijawab secara generatif.";
    } catch (err) {
      for (const t of tombol) t.disabled = false;
      kemajuan.hidden = true;
      el.dataset.model = "gagal";
      status.textContent = `Model gagal dimuat (${err.message}). Jawaban tetap memakai kutipan langsung.`;
    }
  }

  // jalur(): "server" atau "lokal" bila mode generatif dipilih dan siap; selain itu null.
  return { el, jalur: () => (mode !== "kutipan" && siap(mode) ? mode : null) };
}
