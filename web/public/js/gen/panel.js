// Pilihan mode jawaban di ruang kerja: kutipan langsung (bawaan) atau generatif di perangkat.
// Model generatif hanya diunduh setelah pengguna menekan tombol muat.
import { h } from "../dom.js";
import { MODEL, MODEL_CPU } from "./prompt.js";
import { UKURAN_UNDUHAN_MB, muatModel, periksaDukungan, sudahDimuat } from "./runtime.js";

const nama = (m) => m.id.split("/")[1];

const mb = (b) => Math.round(b / 1e6).toLocaleString("id-ID");

export function createModePanel() {
  let mode = "kutipan";
  let perangkat = "webgpu";
  const status = h("p", { class: "mode-status", role: "status" });
  const batang = h("span", { class: "mode-batang-isi" });
  const kemajuan = h("div", { class: "mode-batang", hidden: true, "aria-hidden": "true" }, batang);
  const tombol = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: () => muat("webgpu") }, `Muat model (sekitar ${UKURAN_UNDUHAN_MB.webgpu.toLocaleString("id-ID")} MB)`);
  const tombolCpu = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: () => muat("wasm") }, `Pakai model kecil di CPU (sekitar ${UKURAN_UNDUHAN_MB.wasm.toLocaleString("id-ID")} MB, lambat)`);
  const pilih = (nilai, label, ket) => h("label", { class: "mode-pilih" },
    h("input", { type: "radio", name: "mode-jawab", value: nilai, checked: nilai === "kutipan", onchange: () => ganti(nilai) }),
    h("span", {}, h("strong", {}, label), h("span", { class: "catatan" }, ket)));
  const el = h("fieldset", { class: "mode-jawab" },
    h("legend", { class: "subjudul" }, "Mode jawaban"),
    pilih("kutipan", "Kutipan langsung", "Kalimat disalin persis dari pasal. Cepat, tanpa unduhan model."),
    pilih("generatif", "Generatif di perangkat Anda", `Model bahasa menulis jawaban singkat dengan sitasi [n] ke pasal: ${nama(MODEL)} di GPU (WebGPU), atau ${nama(MODEL_CPU)} di CPU.`),
    tombol, tombolCpu, kemajuan, status);

  async function ganti(nilai) {
    mode = nilai;
    el.dataset.mode = nilai;
    tombol.hidden = true;
    tombolCpu.hidden = true;
    status.textContent = "";
    if (nilai !== "generatif") return;
    if (sudahDimuat()) { status.textContent = "Model siap. Pertanyaan berikutnya dijawab secara generatif."; return; }
    const d = await periksaDukungan();
    const unduh = "Bobot model diunduh dari Hugging Face dan pustakanya dari jsDelivr, sekali saja, lalu disimpan di peramban. Pertanyaan Anda tetap diproses di perangkat ini.";
    if (!d.ok) {
      tombolCpu.hidden = false;
      status.textContent = `${d.alasan} Jawaban tetap memakai kutipan langsung. Sebagai gantinya, model yang lebih kecil (${nama(MODEL_CPU)}) bisa dijalankan di CPU. Hasilnya lebih lemah dan satu jawaban dapat memakan beberapa menit; angkanya dilaporkan terpisah di halaman Evaluasi. ${unduh}`;
      return;
    }
    tombol.hidden = false;
    status.textContent = unduh;
  }

  async function muat(p) {
    perangkat = p;
    tombol.disabled = true;
    tombolCpu.disabled = true;
    kemajuan.hidden = false;
    const per = new Map();
    status.textContent = "Mengunduh model…";
    try {
      await muatModel(perangkat, (p) => {
        per.set(p.file, [p.loaded, p.total]);
        const [a, b] = [...per.values()].reduce(([x, y], [l, t]) => [x + l, y + t], [0, 0]);
        batang.style.width = `${b ? Math.round((a / b) * 100) : 0}%`;
        status.textContent = `Mengunduh model: ${mb(a)} dari ${mb(b)} MB`;
      });
      tombol.hidden = true;
      tombolCpu.hidden = true;
      kemajuan.hidden = true;
      el.dataset.model = "siap";
      status.textContent = perangkat === "webgpu" ? "Model siap. Pertanyaan berikutnya dijawab secara generatif." : `Model ${nama(MODEL_CPU)} siap di CPU. Pertanyaan berikutnya dijawab secara generatif; mohon bersabar, prosesnya lambat.`;
    } catch (err) {
      tombol.disabled = false;
      tombolCpu.disabled = false;
      kemajuan.hidden = true;
      el.dataset.model = "gagal";
      status.textContent = `Model gagal dimuat (${err.message}). Jawaban tetap memakai kutipan langsung.`;
    }
  }

  return { el, generatif: () => mode === "generatif" && sudahDimuat() };
}
