// Pilihan mode jawaban di ruang kerja: kutipan langsung (bawaan) atau generatif di perangkat.
// Model generatif hanya diunduh setelah pengguna menekan tombol muat.
import { h } from "../dom.js";
import { MODEL } from "./prompt.js";
import { UKURAN_UNDUHAN_MB, muatModel, periksaDukungan, sudahDimuat } from "./runtime.js";

const mb = (b) => Math.round(b / 1e6).toLocaleString("id-ID");

export function createModePanel() {
  let mode = "kutipan";
  const status = h("p", { class: "mode-status", role: "status" });
  const batang = h("span", { class: "mode-batang-isi" });
  const kemajuan = h("div", { class: "mode-batang", hidden: true, "aria-hidden": "true" }, batang);
  const tombol = h("button", { class: "tombol tombol-pelan", type: "button", hidden: true, onclick: muat }, `Muat model (sekitar ${UKURAN_UNDUHAN_MB.toLocaleString("id-ID")} MB)`);
  const pilih = (nilai, label, ket) => h("label", { class: "mode-pilih" },
    h("input", { type: "radio", name: "mode-jawab", value: nilai, checked: nilai === "kutipan", onchange: () => ganti(nilai) }),
    h("span", {}, h("strong", {}, label), h("span", { class: "catatan" }, ket)));
  const el = h("fieldset", { class: "mode-jawab" },
    h("legend", { class: "subjudul" }, "Mode jawaban"),
    pilih("kutipan", "Kutipan langsung", "Kalimat disalin persis dari pasal. Cepat, tanpa unduhan model."),
    pilih("generatif", "Generatif di perangkat Anda", `Model ${MODEL.id.split("/")[1]} menulis jawaban singkat dengan sitasi [n] ke pasal. Butuh WebGPU.`),
    tombol, kemajuan, status);

  async function ganti(nilai) {
    mode = nilai;
    el.dataset.mode = nilai;
    tombol.hidden = true;
    status.textContent = "";
    if (nilai !== "generatif") return;
    if (sudahDimuat()) { status.textContent = "Model siap. Pertanyaan berikutnya dijawab secara generatif."; return; }
    const d = await periksaDukungan();
    if (!d.ok) {
      status.textContent = `${d.alasan} Jawaban tetap memakai kutipan langsung.`;
      return;
    }
    tombol.hidden = false;
    status.textContent = "Bobot model diunduh dari Hugging Face dan pustakanya dari jsDelivr, sekali saja, lalu disimpan di peramban. Pertanyaan Anda tetap diproses di perangkat ini.";
  }

  async function muat() {
    tombol.disabled = true;
    kemajuan.hidden = false;
    const per = new Map();
    status.textContent = "Mengunduh model…";
    try {
      await muatModel((p) => {
        per.set(p.file, [p.loaded, p.total]);
        const [a, b] = [...per.values()].reduce(([x, y], [l, t]) => [x + l, y + t], [0, 0]);
        batang.style.width = `${b ? Math.round((a / b) * 100) : 0}%`;
        status.textContent = `Mengunduh model: ${mb(a)} dari ${mb(b)} MB`;
      });
      tombol.hidden = true;
      kemajuan.hidden = true;
      status.textContent = "Model siap. Pertanyaan berikutnya dijawab secara generatif.";
    } catch (err) {
      tombol.disabled = false;
      kemajuan.hidden = true;
      status.textContent = `Model gagal dimuat (${err.message}). Jawaban tetap memakai kutipan langsung.`;
    }
  }

  return { el, generatif: () => mode === "generatif" && sudahDimuat() };
}
