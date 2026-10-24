import { clear, h } from "./dom.js";
export function mountEvaluation(main) {
  clear(main).append(h("div", { class: "halaman" }, h("h1", {}, "Evaluasi"), h("p", {}, "Segera.")));
  main.dataset.ready = "evaluasi";
}
