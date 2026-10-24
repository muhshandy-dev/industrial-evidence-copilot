// Ruang kerja: sumber di kiri, tanya jawab di tengah, bukti di kanan.
import { h, clear } from "./dom.js";
import { Retriever, rankOrder } from "./retrieval.js";
import { extractAnswer } from "./answer.js";
import { createReader } from "./reader.js";
import { wait, motionOn } from "./motion.js";
import { createModePanel } from "./gen/panel.js";
import { bacaJawaban, pasalUntukPrompt, periksa, susunPesan, K_PASAL } from "./gen/prompt.js";
import { bangkitkan, modelUntuk, perangkatAktif } from "./gen/runtime.js";

const num = (x) => x.toFixed(1).replace(".", ",");

export function mountWorkspace(main, { korpus, indeks, evaluasi }) {
  const retriever = new Retriever(indeks);
  const idf = Object.fromEntries(Object.entries(indeks.bm25).map(([t, v]) => [t, v[0]]));
  const texts = korpus.chunk.map((c) => c.teks_cari || c.teks);
  const shownTexts = korpus.chunk.map((c) => c.teks);
  const threshold = evaluasi.ambang_jawab;
  const active = new Set(korpus.dokumen.map((_, i) => i));
  const root = h("div", { class: "ruang", data: { fokus: "tanya" } });
  const readerBox = h("div", { class: "pane-isi", id: "pembaca" });
  const reader = createReader(readerBox, korpus);
  const thread = h("div", { class: "percakapan", "aria-live": "polite" });
  const input = h("textarea", { id: "pertanyaan", rows: "2", maxlength: "400", placeholder: "Contoh: berapa lama batas waktu melaporkan kecelakaan kerja?", "aria-label": "Pertanyaan Anda" });
  const submit = h("button", { class: "tombol", type: "submit" }, "Cari bukti");
  let busy = false;
  const modePanel = createModePanel();

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
      modePanel.el,
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
  clear(main).append(h("h1", { class: "sr" }, "Ruang kerja: tanya jawab atas peraturan K3"), root);
  main.dataset.ready = "ruang";

  /* Pencarian */
  function search(query) {
    const tokens = retriever.queryTokens(query);
    const raw = retriever.scores(tokens);
    const scores = raw.map((v, i) => (active.has(korpus.chunk[i].dok) ? v : -Infinity));
    const ranked = rankOrder(scores).filter((i) => active.has(korpus.chunk[i].dok));
    return { tokens, scores, ranked };
  }

  async function ask(raw) {
    const q = raw.trim();
    if (!q || busy) return;
    busy = true; submit.disabled = true;
    empty.remove();
    setFokus("tanya");
    const { tokens, scores, ranked } = search(q);
    const topScore = ranked.length ? scores[ranked[0]] : 0;
    const ans = extractAnswer(q, ranked, texts, idf, { topScore, threshold, useStem: indeks.pakai_stem, displayTexts: shownTexts });
    const card = h("article", { class: "jawaban masuk", "aria-label": "Jawaban" });
    // Mode akhir jawaban (dipakai uji): generatif, tolak_model, cadangan_ekstraktif,
    // galat_model, tolak_gerbang, atau ekstraktif.
    thread.append(h("h3", { class: "pertanyaan masuk" }, q), card);
    card.scrollIntoView({ block: "nearest", behavior: motionOn() ? "smooth" : "auto" });

    const top = ranked.slice(0, 6);
    // Mode generatif memakai gerbang yang sama: di bawah ambang, model tidak dipanggil.
    const generatif = modePanel.generatif() && topScore >= threshold;
    const trace = buildTrace(tokens, top, scores, generatif);
    const lolos = generatif || !ans.abstain;
    const kepala = h("span", { class: "label-mode" }, generatif ? "Jawaban generatif" : lolos ? "Jawaban ekstraktif" : "Tidak menjawab");
    const ringkas = h("span", {}, generatif ? `${modelUntuk(perangkatAktif()).id.split("/")[1]}, di ${perangkatAktif() === "webgpu" ? "GPU" : "CPU"} perangkat ini` : lolos ? `${ans.evidence.length} kutipan` : "Dasar tidak cukup");
    card.append(h("div", { class: "jawaban-kepala" },
      kepala,
      ringkas,
      h("span", { class: "keyakinan", data: { lolos: lolos ? "ya" : "tidak" }, title: "Skor BM25 pasal teratas dibandingkan ambang penolakan. Ini ukuran kecocokan kata, bukan peluang jawaban benar." },
        `Skor ${num(topScore)} · ambang ${num(threshold)}`)));

    // 1. Jejak pencarian tampil lebih dulu supaya pengguna melihat apa yang dicari.
    card.append(trace.el);
    await trace.play();
    await wait(500);
    trace.el.open = false; // setelah urutan terlihat, ringkas agar kutipan jawaban menjadi fokus

    // 2. Jawaban generatif, atau kutipan yang muncul satu per satu.
    card.dataset.mode = generatif ? "generatif" : ans.abstain ? "tolak_gerbang" : "ekstraktif";
    if (generatif) {
      await jawabGeneratif(card, q, ranked, ans, top, kepala, ringkas);
    } else if (ans.abstain) {
      card.append(h("div", { class: "tolak masuk" },
        h("h3", {}, "Korpus ini tidak memuat dasar yang cukup untuk menjawab."),
        h("p", {}, "Sistem lebih baik menolak daripada menebak. Coba pakai istilah yang ada di peraturan, atau periksa apakah topiknya memang diatur di dokumen yang dipilih."),
        top.length ? h("div", {}, h("div", { class: "subjudul" }, "Pasal terdekat (belum tentu menjawab)"),
          h("div", { class: "terdekat" }, top.slice(0, 3).map((ci) => h("button", { type: "button", onclick: () => open(ci, []) },
            h("span", {}, `${korpus.dokumen[korpus.chunk[ci].dok].judul}, ${korpus.chunk[ci].label}`), h("span", { class: "kode" }, "buka"))))) : null));
    } else {
      await tampilkanKutipan(card, ans, top);
    }
    busy = false; submit.disabled = false;
    card.dataset.selesai = "ya";
    thread.parentElement.scrollTo?.({ top: thread.parentElement.scrollHeight, behavior: motionOn() ? "smooth" : "auto" });
  }

  function tolakBox(judul, isi, top) {
    return h("div", { class: "tolak masuk" },
      h("h3", {}, judul),
      h("p", {}, isi),
      top.length ? h("div", {}, h("div", { class: "subjudul" }, "Pasal terdekat (belum tentu menjawab)"),
        h("div", { class: "terdekat" }, top.slice(0, 3).map((ci) => h("button", { type: "button", onclick: () => open(ci, []) },
          h("span", {}, `${korpus.dokumen[korpus.chunk[ci].dok].judul}, ${korpus.chunk[ci].label}`), h("span", { class: "kode" }, "buka"))))) : null);
  }

  async function jawabGeneratif(card, q, ranked, ans, top, kepala, ringkas) {
    const pasal = pasalUntukPrompt(korpus, ranked);
    const tulis = h("p", { class: "gen-mentah", "aria-hidden": "true" });
    const tunggu = h("p", { class: "catatan gen-tunggu", role: "status" }, "Model sedang menulis jawaban dari pasal yang ditemukan…");
    card.append(h("div", { class: "jawaban-isi" }, tunggu, tulis));
    let mentah = "";
    try {
      mentah = await bangkitkan(susunPesan(q, pasal), (t) => { tulis.textContent += t; });
    } catch (err) {
      tunggu.textContent = `Model gagal menjawab (${err.message}). Ditampilkan kutipan langsung.`;
      tulis.remove();
      card.dataset.mode = "galat_model";
      kepala.textContent = "Kutipan cadangan";
      if (ans.abstain) card.append(tolakBox("Korpus ini tidak memuat dasar yang cukup untuk menjawab.", "Kutipan langsung juga menolak menjawab.", top));
      else await tampilkanKutipan(card, ans, top);
      return;
    }
    tunggu.parentElement.remove();
    const hasil = periksa(bacaJawaban(mentah, pasal.length), pasal);
    if (hasil.status === "tolak") {
      card.dataset.mode = "tolak_model";
      kepala.textContent = "Tidak menjawab";
      ringkas.textContent = "Model: kutipan tidak memuat jawaban";
      card.append(tolakBox("Pasal yang ditemukan tidak memuat jawaban pertanyaan ini.", "Model membaca pasal teratas dan menyatakan jawabannya tidak ada di sana. Coba istilah lain, atau periksa pasal terdekat di bawah.", top));
      return;
    }
    if (hasil.status === "tanpa_dasar") {
      card.dataset.mode = "cadangan_ekstraktif";
      kepala.textContent = "Kutipan cadangan";
      ringkas.textContent = "Jawaban model tidak bersitasi";
      card.append(h("p", { class: "gen-catatan masuk" }, "Model tidak menghasilkan kalimat dengan sitasi yang dapat diperiksa, jadi jawabannya tidak ditampilkan. Berikut kutipan langsung dari pasal peringkat 1."));
      if (ans.abstain) card.append(tolakBox("Kutipan langsung juga tidak menemukan kalimat yang cocok.", "Periksa pasal terdekat di bawah.", top));
      else await tampilkanKutipan(card, ans, top);
      return;
    }
    const box = h("div", { class: "jawaban-isi gen-isi" });
    card.append(box);
    for (const k of hasil.kalimat) {
      box.append(h("p", { class: "gen-kalimat masuk" }, k.teks, " ",
        ...k.sitasi.map((n) => h("button", { type: "button", class: "gen-sitasi", onclick: () => open(pasal[n - 1].chunk, []), "aria-label": `Buka sumber ${n}: ${pasal[n - 1].sumber}` }, `[${n}]`))));
      await wait(160);
    }
    const dikutip = new Set(hasil.kalimat.flatMap((k) => k.sitasi));
    card.append(h("ol", { class: "gen-sumber masuk" }, pasal.map((p) => h("li", { data: { dikutip: dikutip.has(p.n) ? "ya" : "tidak" } },
      h("button", { type: "button", onclick: () => open(p.chunk, []) }, h("span", { class: "kode" }, `[${p.n}]`), h("span", {}, p.sumber))))));
    const dibuang = hasil.dibuang.length ? ` ${hasil.dibuang.length} kalimat tanpa sitasi yang sah dibuang.` : "";
    card.append(h("p", { class: "jawaban-kaki masuk" }, `Kalimat di atas ditulis oleh model bahasa dari pasal bernomor, bukan disalin. Model bisa keliru membaca atau merangkum; periksa pasal yang dirujuk.${dibuang} Ini bukan nasihat hukum.`));
    reader.show(pasal[hasil.kalimat[0].sitasi[0] - 1].chunk, { scroll: innerWidth > 1100 });
  }

  async function tampilkanKutipan(card, ans, top) {
    {
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
      const lain = top.slice(1, 4);
      if (lain.length) {
        card.append(h("div", { class: "lain masuk" }, h("div", { class: "subjudul" }, "Pasal lain yang mirip (periksa bila jawaban di atas kurang tepat)"),
          h("div", { class: "terdekat" }, lain.map((ci) => h("button", { type: "button", onclick: () => open(ci, []) },
            h("span", {}, `${korpus.dokumen[korpus.chunk[ci].dok].judul}, ${korpus.chunk[ci].label}`), h("span", { class: "kode" }, "buka"))))));
      }
      card.append(h("p", { class: "jawaban-kaki masuk" }, "Kalimat di atas disalin persis dari peraturan. Sistem ini bisa keliru memilih pasal; angka dan batasnya ada di halaman Evaluasi. Ini bukan nasihat hukum."));
      const first = ans.evidence[0];
      reader.show(first.chunk, { units: ans.evidence.map((e) => e.unit), scroll: innerWidth > 1100 });
    }
  }

  function open(chunkIdx, units) {
    reader.show(chunkIdx, { units });
    setFokus("bukti");
  }

  // Jejak pencarian: urutan pasal menurut skor BM25 dan kontribusi tiap istilah, supaya terlihat
  // kata mana yang membuat suatu pasal naik. Batang tumbuh berurutan dari peringkat 1.
  function buildTrace(tokens, top, scores, generatif = false) {
    const unik = [...new Set(tokens)];
    const asing = unik.filter((t) => !(t in idf));
    const max = top.length ? scores[top[0]] : 1;
    const bars = [];
    const rows = top.map((ci, i) => {
      const c = korpus.chunk[ci];
      const d = korpus.dokumen[c.dok];
      const parts = retriever.explain(tokens, ci).filter((x) => x.part > 0).sort((a, b) => b.part - a.part);
      const bar = h("span", { class: "jejak-isi-batang" });
      bars.push([bar, max > 0 ? scores[ci] / max : 0]);
      return h("li", { class: "jejak-baris", data: { dibaca: i === 0 ? "ya" : "tidak" } },
        h("span", { class: "jejak-no" }, String(i + 1)),
        h("span", { class: "jejak-nama" }, `${d.judul}, ${c.label}`),
        h("span", { class: "jejak-skor" }, num(scores[ci])),
        h("span", { class: "jejak-batang", "aria-hidden": "true" }, bar),
        h("span", { class: "jejak-istilah" }, parts.map((x) => h("span", { class: "chip", title: `idf ${x.idf.toFixed(2)}, muncul ${x.tf}x di pasal ini` }, `${x.term} +${num(x.part)}`))));
    });
    const el = h("details", { class: "jejak", open: true },
      h("summary", {}, "Jejak pencarian", h("span", { class: "jejak-sumber" }, `${top.length} pasal teratas menurut skor BM25`)),
      h("div", { class: "jejak-isi" },
        asing.length ? h("p", { class: "jejak-catatan" }, `Istilah yang tidak ada di korpus dan tidak ikut menilai: ${asing.join(", ")}.`) : null,
        h("ol", { class: "jejak-daftar" }, rows),
        h("p", { class: "jejak-catatan" }, `${generatif ? `Model generatif membaca ${K_PASAL} pasal teratas.` : "Kutipan hanya diambil dari pasal peringkat 1."} Angka kecil di tiap baris adalah sumbangan istilah pertanyaan pada skor pasal itu.`)));
    return {
      el,
      async play() {
        for (const [bar, frac] of bars) {
          requestAnimationFrame(() => { bar.style.width = `${Math.max(2, Math.round(frac * 100))}%`; });
          await wait(90);
        }
        await wait(250);
      },
    };
  }

  return { ask, reader, setFokus };
}
