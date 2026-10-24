import { clear, h } from "./dom.js";
export function mountMethod(main) {
  clear(main).append(h("div", { class: "halaman" }, h("h1", {}, "Cara kerja dan batas"), h("p", {}, "Segera.")));
  main.dataset.ready = "metode";
}
