// Ruang kerja: sumber di kiri, tanya jawab di tengah, bukti di kanan.
import { h, clear } from "./dom.js";
import { Retriever, rankOrder, rrf } from "./retrieval.js";
import { extractAnswer } from "./answer.js";
import { createReader } from "./reader.js";
import { flip, wait, motionOn } from "./motion.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const tingkat = (cov) => (cov >= 0.8 ? "tinggi" : cov >= 0.6 ? "sedang" : "rendah");
const tingkatTeks = { tinggi: "Kecocokan istilah tinggi", sedang: "Kecocokan istilah sedang", rendah: "Kecocokan istilah rendah" };

export function mountWorkspace(main, { korpus, indeks, evaluasi }) {
  const retriever = new Retriever(indeks);
  const idf = Object.fromEntries(Object.entries(indeks.bm25).map(([t, v]) => [t, v[0]]));
  const texts = korpus.chunk.map((c) => c.teks);
  const threshold = evaluasi?.ambang_jawab ?? 0.5;
  const active = new Set(korpus.dokumen.map((_, i) => i));
  const root = h("div", { class: "ruang", data: { fokus: "tanya" } });
  const readerBox = h("div", { class: "pane-isi", id: "pembaca" });
  const reader = createReader(readerBox, korpus);
  const thread = h("div", { class: "percakapan", "aria-live": "polite" });
  const input = h("textarea", { id: "pertanyaan", rows: "2", maxlength: "400", placeholder: "Contoh: berapa lama batas waktu melaporkan kecelakaan kerja?", "aria-label": "Pertanyaan Anda" });
  const submit = h("button", { class: "tombol", type: "submit" }, "Cari bukti");
  let busy = false;

  const setFokus = (f) => {
    root.dataset.fokus = f;
    for (const b of tabs.querySelectorAll("button")) b.setAttribute("aria-selected", String(b.dataset.tab === f));
  };

  /* Sumber */
  const docList = h("div", { class: "dok-daftar" });
  korpus.dokumen.forEach((d, i) => {
    const count = korpus.chunk.filter((c) => c.dok === i).length;
    const cb = h("input", { type: "checkbox", checked: true, "aria-label": `Cari di ${d.judul}`, onchange: () => {
      if (cb.checked) active.add(i); else active.delete(i);
      if (active.size === 0) { active.add(i); cb.checked = true; }
      for (const el of docList.children) el.dataset.aktif = active.has(Number(el.dataset.i)) ? "ya" : "tidak";
    } });
    docList.append(h("label", { class: "dok", data: { i, aktif: "ya" } }, cb,
      h("span", { class: "dok-judul" }, d.judul),
      h("span", { class: "dok-tentang" }, d.tentang),
      h("span", { class: "dok-meta" }, `${count} pasal`),
      h("button", { class: "dok-buka", type: "button", onclick: (e) => { e.preventDefault(); const first = korpus.chunk.findIndex((c) => c.dok === i); reader.show(first, { scroll: false }); setFokus("bukti"); } }, "Baca dokumen")));
  });
  const examples = (evaluasi?.contoh ?? []).map((q) => h("button", { type: "button", onclick: () => { input.value = q; ask(q); } }, q));

  const paneSumber = h("section", { class: "pane pane-sumber", "aria-labelledby": "h-sumber" },
    h("div", { class: "pane-kepala" }, h("h2", { id: "h-sumber" }, "Sumber"), h("span", { class: "hitung" }, `${korpus.dokumen.length} dokumen · ${korpus.chunk.length} pasal`)),
    h("div", { class: "pane-isi" },
      h("div", {}, h("div", { class: "subjudul" }, "Dokumen yang dicari"), docList),
      examples.length ? h("div", {}, h("div", { class: "subjudul" }, "Contoh pertanyaan"), h("div", { class: "contoh" }, examples)) : null,
      h("p", { class: "catatan" }, "Semua dokumen adalah peraturan perundang-undangan resmi. Daftar lengkap, sumber, dan dasar lisensinya ada di halaman Cara kerja dan batas.")));

  /* Tanya */
  const empty = h("div", { class: "kosong" },
    h("h3", {}, "Tanyakan sesuatu tentang K3"),
    h("p", {}, "Setiap jawaban berupa kutipan langsung dari pasal peraturan, lengkap dengan nomor pasalnya. Bila korpus tidak memuat dasar yang cukup, sistem menolak menjawab, bukan menebak."));
  thread.append(empty);
  const form = h("form", { class: "tanya", onsubmit: (e) => { e.preventDefault(); ask(input.value); } },
    h("div", { class: "tanya-baris" }, input, submit),
    h("p", { class: "petunjuk" }, "Enter untuk mengirim, Shift+Enter untuk baris baru. Pertanyaan diproses di peramban Anda dan tidak dikirim ke server."));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const paneTanya = h("section", { class: "pane pane-tanya", "aria-labelledby": "h-tanya" },
    h("div", { class: "pane-kepala" }, h("h2", { id: "h-tanya" }, "Tanya jawab")),
    h("div", { class: "pane-isi" }, thread),
    form);

  const paneBukti = h("section", { class: "pane pane-bukti", "aria-labelledby": "h-bukti" },
    h("div", { class: "pane-kepala" }, h("h2", { id: "h-bukti" }, "Bukti")), readerBox);

  const tabs = h("div", { class: "tab-bawah", role: "tablist", "aria-label": "Panel" },
    ...[["sumber", "Sumber"], ["tanya", "Tanya"], ["bukti", "Bukti"]].map(([k, label]) =>
      h("button", { type: "button", role: "tab", data: { tab: k }, "aria-selected": String(k === "tanya"), onclick: () => setFokus(k) }, label)));

  root.append(paneSumber, paneTanya, paneBukti, tabs);
  clear(main).append(root);
  main.dataset.ready = "ruang";

  /* Pencarian */
  function rankings(query) {
    const tokens = retriever.queryTokens(query);
    const mask = korpus.chunk.map((c) => active.has(c.dok));
    const apply = (s) => s.map((v, i) => (mask[i] ? v : -Infinity));
    const b = apply(retriever.bm25(tokens));
    const l = apply(retriever.lsa(tokens));
    const f = apply(rrf([b, l], indeks.rrf_k));
    const rank = (s) => { const r = new Map(); rankOrder(s).forEach((d, i) => r.set(d, i + 1)); return r; };
    return { fused: rankOrder(f).filter((i) => mask[i]), bm: rank(b), ls: rank(l) };
  }

  async function ask(raw) {
    const q = raw.trim();
    if (!q || busy) return;
    busy = true; submit.disabled = true;
    empty.remove();
    setFokus("tanya");
    const { fused, bm, ls } = rankings(q);
    const ans = extractAnswer(q, fused, texts, idf, { threshold, useStem: indeks.pakai_stem });
    const card = h("article", { class: "jawaban masuk", "aria-label": "Jawaban" });
    thread.append(h("h3", { class: "pertanyaan masuk" }, q), card);
    card.scrollIntoView({ block: "nearest", behavior: motionOn() ? "smooth" : "auto" });

    const top = fused.slice(0, 6);
    const trace = buildTrace(top, bm, ls);
    const level = tingkat(ans.coverage);
    card.append(h("div", { class: "jawaban-kepala" },
      h("span", { class: "label-mode" }, ans.abstain ? "Tidak menjawab" : "Jawaban ekstraktif"),
      h("span", {}, ans.abstain ? "Dasar tidak cukup" : `${ans.evidence.length} kutipan`),
      h("span", { class: "keyakinan", data: { tingkat: level }, title: "Seberapa besar bobot istilah pertanyaan yang ditemukan di pasal teratas. Ini ukuran kecocokan kata, bukan peluang jawaban benar." },
        tingkatTeks[level], " ", h("span", { class: "meter", "aria-hidden": "true" }, h("span", { class: "meter-isi" })), " ", pct(ans.coverage))));
    const meter = card.querySelector(".meter-isi");
    requestAnimationFrame(() => { meter.style.width = pct(ans.coverage); });

    // 1. Jejak pencarian tampil lebih dulu supaya pengguna melihat apa yang dicari.
    card.append(trace.el);
    await wait(trace.reorderDelay);
    await trace.reorder();
    await wait(700);
    trace.el.open = false; // setelah urutan terlihat, ringkas agar kutipan jawaban menjadi fokus

    // 2. Kutipan muncul satu per satu.
    if (ans.abstain) {
      card.append(h("div", { class: "tolak masuk" },
        h("h3", {}, "Korpus ini tidak memuat dasar yang cukup untuk menjawab."),
        h("p", {}, "Sistem lebih baik menolak daripada menebak. Coba pakai istilah yang ada di peraturan, atau periksa apakah topiknya memang diatur di dokumen yang dipilih."),
        top.length ? h("div", {}, h("div", { class: "subjudul" }, "Pasal terdekat (belum tentu menjawab)"),
          h("div", { class: "terdekat" }, top.slice(0, 3).map((ci) => h("button", { type: "button", onclick: () => open(ci, []) },
            h("span", {}, `${korpus.dokumen[korpus.chunk[ci].dok].judul}, ${korpus.chunk[ci].label}`), h("span", { class: "kode" }, "buka"))))) : null));
    } else {
      const box = h("div", { class: "jawaban-isi" });
      card.append(box);
      for (let i = 0; i < ans.evidence.length; i++) {
        const e = ans.evidence[i];
        const c = korpus.chunk[e.chunk];
        const label = `${korpus.dokumen[c.dok].judul}, ${c.label}`;
        const button = h("button", { type: "button", class: "kutipan masuk", onclick: () => open(e.chunk, [e.unit]), "aria-label": `Buka bukti: ${label}` },
          h("span", {}, e.text), h("span", { class: "sumber" }, `[${i + 1}] ${label}`));
        box.append(button);
        await wait(220);
      }
      card.append(h("p", { class: "jawaban-kaki masuk" }, "Kalimat di atas disalin persis dari peraturan. Ini bukan nasihat hukum; periksa pasal lengkap dan peraturan turunannya."));
      const first = ans.evidence[0];
      reader.show(first.chunk, { units: [first.unit], scroll: innerWidth > 1100 });
    }
    busy = false; submit.disabled = false;
    card.dataset.selesai = "ya";
    thread.parentElement.scrollTo?.({ top: thread.parentElement.scrollHeight, behavior: motionOn() ? "smooth" : "auto" });
  }

  function open(chunkIdx, units) {
    reader.show(chunkIdx, { units });
    setFokus("bukti");
  }

  function buildTrace(top, bm, ls) {
    const list = h("div", { class: "jejak-isi" });
    const byBm = [...top].sort((a, b) => bm.get(a) - bm.get(b));
    const rows = new Map();
    top.forEach((ci, finalIdx) => {
      const c = korpus.chunk[ci];
      const d = korpus.dokumen[c.dok];
      rows.set(ci, h("div", { class: "jejak-baris", data: { dipilih: finalIdx < 3 ? "ya" : "tidak" } },
        h("span", { class: "jejak-no" }, String(finalIdx + 1)),
        h("span", { class: "jejak-nama" }, `${d.judul}, ${c.label}`),
        h("span", { class: "jejak-sumber", title: "Peringkat di BM25 dan LSA" }, `BM25 #${bm.get(ci)} · LSA #${ls.get(ci)}`),
        h("span", { class: "jejak-lencana" }, finalIdx < 3 ? "dibaca" : "cadangan")));
    });
    const place = (order) => {
      clear(list);
      list.append(h("div", { class: "jejak-judul" }, order === byBm ? "Urutan BM25 (kata kunci)" : "Urutan akhir (BM25 dan LSA digabung)"));
      order.forEach((ci, i) => { rows.get(ci).querySelector(".jejak-no").textContent = String(i + 1); list.append(rows.get(ci)); });
    };
    const animate = motionOn() && byBm.some((c, i) => c !== top[i]);
    place(animate ? byBm : top);
    const el = h("details", { class: "jejak", open: true },
      h("summary", {}, "Jejak pencarian", h("span", { class: "jejak-sumber" }, `${top.length} pasal diperingkat`)),
      list,
      h("p", { class: "jejak-catatan" }, "Tiga pasal teratas dibaca untuk memilih kalimat jawaban. Pasal cadangan hanya ditampilkan."));
    return {
      el,
      reorderDelay: animate ? 700 : 0,
      async reorder() {
        if (!animate) return;
        await flip(list, () => place(top));
      },
    };
  }

  return { ask, reader, setFokus };
}
