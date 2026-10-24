// Halaman Evaluasi: semua angka dibaca dari data/evaluasi.json yang dihasilkan `evidence eval`.
import { clear, h, svg } from "./dom.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const rentang = (m) => `${pct(m.bawah)} sampai ${pct(m.atas)}`;
const NAMA_GAGAL = {
  sitasi_pasal_salah: "Pasal yang dikutip bukan yang tepat",
  menolak_padahal_terjawab: "Menolak padahal korpus memuat jawabannya",
  pasal_benar_kunci_tidak_ada: "Pasal tepat, tetapi kalimat yang dipilih belum memuat fakta kunci",
  dijawab_padahal_tak_terjawab: "Menjawab pertanyaan yang tidak ada dasarnya",
};

function kartu(judul, nilai, rinci, catatan) {
  return h("div", { class: "kartu-angka" },
    h("div", { class: "kartu-judul" }, judul),
    h("div", { class: "kartu-nilai" }, nilai),
    h("div", { class: "kartu-rinci" }, rinci),
    catatan ? h("div", { class: "kartu-catatan" }, catatan) : null);
}

function batas(m) {
  // Batang interval: titik di nilai, garis dari batas bawah ke atas.
  const line = h("span", { class: "interval-garis" });
  const dot = h("span", { class: "interval-titik" });
  requestAnimationFrame(() => {
    line.style.left = `${m.bawah * 100}%`;
    line.style.width = `${(m.atas - m.bawah) * 100}%`;
    dot.style.left = `${m.nilai * 100}%`;
  });
  return h("span", { class: "interval", role: "img", "aria-label": `${pct(m.nilai)}, rentang ${rentang(m)}` }, line, dot);
}

function grafikAmbang(ev) {
  const W = 640, H = 260, L = 44, R = 12, T = 12, B = 34;
  const pts = ev.ambang.sapuan_test;
  const maxX = pts[pts.length - 1].ambang;
  const x = (v) => L + (v / maxX) * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);
  const path = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.ambang).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "grafik", "aria-label": "Grafik: semakin tinggi ambang penolakan, semakin sedikit pertanyaan di luar cakupan yang dijawab, tetapi semakin banyak pertanyaan yang sebenarnya terjawab ikut ditolak." });
  for (let t = 0; t <= 1.0001; t += 0.25) {
    g.append(svg("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "grafik-kisi" }), svg("text", { x: L - 8, y: y(t) + 4, class: "grafik-label", "text-anchor": "end" }, `${Math.round(t * 100)}%`));
  }
  for (let t = 0; t <= maxX; t += 10) g.append(svg("text", { x: x(t), y: H - 12, class: "grafik-label", "text-anchor": "middle" }, String(t)));
  g.append(svg("text", { x: (L + W - R) / 2, y: H - 0, class: "grafik-label", "text-anchor": "middle" }, "Ambang skor BM25"));
  const sel = ev.ambang.terpilih;
  g.append(svg("line", { x1: x(sel), x2: x(sel), y1: T, y2: H - B, class: "grafik-pilih" }),
    svg("text", { x: x(sel) + 6, y: T + 12, class: "grafik-label" }, `dipilih dari dev: ${sel}`));
  g.append(svg("path", { d: path("jawaban_benar"), class: "garis-benar" }), svg("path", { d: path("dijawab_padahal_tak_terjawab"), class: "garis-salah" }));
  return g;
}

export function mountEvaluation(main, { evaluasi: ev }) {
  const ps = ev.pencarian.per_sistem;
  const kirim = ev.metode_dikirim;
  const t = ev.jawaban.test;
  const d = ev.jawaban.dev;
  const q = ev.pertanyaan;
  const m = ps[kirim].metrik.test;

  const hasil = h("section", { "aria-labelledby": "e-hasil" },
    h("h2", { id: "e-hasil" }, "Hasil pada data uji"),
    h("p", { class: "catatan" }, `Data uji berisi ${t.jawaban_benar.n} pertanyaan yang ada jawabannya dan ${t.dijawab_padahal_tak_terjawab.n} pertanyaan yang sengaja tidak ada jawabannya di korpus. Rentang di bawah angka adalah interval kepercayaan 95%; makin sempit makin pasti.`),
    h("div", { class: "kartu-baris" },
      kartu("Pasal tepat di peringkat 1", pct(m["hit@1"].nilai), rentang(m["hit@1"]), "Seberapa sering pasal yang memuat jawaban ada di urutan pertama."),
      kartu("Pasal tepat di lima teratas", pct(m["hit@5"].nilai), rentang(m["hit@5"]), "Bila pasal di urutan pertama keliru, seberapa sering pasal yang tepat masih terlihat."),
      kartu("Jawaban benar", pct(t.jawaban_benar.nilai), rentang(t.jawaban_benar), "Menjawab, mengutip pasal yang tepat, dan kalimat kutipannya memuat fakta kunci."),
      kartu("Menolak padahal ada jawabannya", pct(t.menolak_padahal_terjawab.nilai), rentang(t.menolak_padahal_terjawab), "Harga dari sikap hati-hati: pertanyaan yang sebenarnya terjawab tetapi sistem memilih diam."),
      kartu("Menjawab pertanyaan tanpa dasar", `${t.dijawab_padahal_tak_terjawab.k} dari ${t.dijawab_padahal_tak_terjawab.n}`, `batas atas ${pct(t.dijawab_padahal_tak_terjawab.atas)}`, "Pertanyaan di luar peraturan atau di luar korpus yang tetap dijawab. Inilah bentuk halusinasi yang relevan untuk sistem ekstraktif."),
      kartu("Kalimat yang bukan salinan", `${t.kutipan_tidak_verbatim.jumlah} dari ${t.kutipan_tidak_verbatim.n}`, "diperiksa otomatis", "Setiap kalimat jawaban dicocokkan huruf demi huruf dengan teks pasalnya. Karena tidak ada model yang menulis, angka ini memang diharapkan nol.")));

  const barisMetode = Object.entries(ps).map(([key, v]) => h("tr", { class: key === kirim ? "dipakai" : null },
    h("th", { scope: "row" }, v.label, key === kirim ? h("span", { class: "lencana" }, "dipakai di situs") : null),
    h("td", { class: "angka" }, pct(v.metrik.dev["mrr@10"].nilai)),
    h("td", { class: "angka" }, pct(v.metrik.test["hit@1"].nilai), batas(v.metrik.test["hit@1"])),
    h("td", { class: "angka" }, pct(v.metrik.test["hit@5"].nilai), batas(v.metrik.test["hit@5"])),
    h("td", { class: "angka" }, pct(v.metrik.test["mrr@10"].nilai), batas(v.metrik.test["mrr@10"]))));
  const sel = ev.pencarian.selisih_berpasangan.hybrid_vs_bm25_konteks["mrr@10"];
  const metode = h("section", { "aria-labelledby": "e-metode" },
    h("h2", { id: "e-metode" }, "Perbandingan metode pencarian"),
    h("p", {}, "Lima cara mencari diuji pada pertanyaan yang sama. Metode yang dipakai situs dipilih hanya dari kolom data dev, sebelum data uji dilihat untuk keputusan itu."),
    h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": "Tabel perbandingan metode, dapat digulir" },
      h("table", { class: "tabel" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Metode"), h("th", { scope: "col" }, "MRR data dev"), h("th", { scope: "col" }, "Peringkat 1 (uji)"), h("th", { scope: "col" }, "Lima teratas (uji)"), h("th", { scope: "col" }, "MRR (uji)"))),
        h("tbody", {}, barisMetode))),
    h("p", { class: "catatan" }, `MRR adalah rata-rata 1/peringkat pasal yang tepat; makin dekat 100% makin baik. Gabungan BM25 dan LSA lebih buruk daripada BM25 dengan konteks: selisih MRR pada data uji ${Math.round(sel.selisih * 100)} poin (interval ${Math.round(sel.bawah * 100)} sampai ${Math.round(sel.atas * 100)}). Karena itu situs hanya memuat BM25. Acak murni menempatkan pasal tepat di lima teratas hanya ${pct(ev.pencarian.acak["hit@5"])} dari waktu.`));

  const gaya = ps[kirim].per_gaya_test;
  const ambang = h("section", { "aria-labelledby": "e-ambang" },
    h("h2", { id: "e-ambang" }, "Kapan sistem memilih diam"),
    h("p", {}, `Sistem menolak menjawab bila skor BM25 pasal teratas lebih kecil dari ambang. Ambang ${ev.ambang.terpilih} dipilih dari data dev dan dipakai apa adanya pada data uji. Grafik memperlihatkan pertukarannya pada data uji: ambang lebih tinggi membuat sistem lebih jarang menjawab pertanyaan tanpa dasar, tetapi lebih sering diam pada pertanyaan yang sebenarnya terjawab.`),
    h("div", { class: "grafik-bungkus" }, grafikAmbang(ev),
      h("div", { class: "legenda" }, h("span", { class: "leg-benar" }, "Jawaban benar"), h("span", { class: "leg-salah" }, "Menjawab pertanyaan tanpa dasar"))),
    h("p", { class: "catatan" }, `Jenis pertanyaan juga berpengaruh. Pertanyaan yang mengulang kata-kata pasal ("leksikal") benar ${pct(t.jawaban_benar_leksikal.nilai)}, pertanyaan yang dirumuskan ulang ("parafrase") benar ${pct(t.jawaban_benar_parafrase.nilai)}. Pertanyaan leksikal tidak otomatis lebih mudah, sebab kata-katanya sering sama persis di banyak peraturan sehingga pasal yang dimaksud sulit dibedakan.`));

  const gagalMap = new Map();
  for (const f of ev.kegagalan_test) { if (!gagalMap.has(f.jenis)) gagalMap.set(f.jenis, []); gagalMap.get(f.jenis).push(f); }
  const nama = (id) => id.replace(/#pasal-/, ", Pasal ");
  const gagal = h("section", { "aria-labelledby": "e-gagal" },
    h("h2", { id: "e-gagal" }, "Di mana sistem gagal"),
    h("p", {}, "Daftar lengkap kegagalan pada data uji, tanpa disaring. Kegagalan terbanyak adalah salah memilih pasal ketika beberapa peraturan memuat kalimat yang mirip."),
    ...[...gagalMap.entries()].map(([jenis, list]) => h("details", { class: "gagal" },
      h("summary", {}, `${NAMA_GAGAL[jenis] ?? jenis}: ${list.length}`),
      h("ul", {}, list.map((f) => h("li", {}, h("strong", {}, f.tanya),
        h("div", { class: "catatan" }, `Seharusnya: ${f.emas.map(nama).join("; ")}. Sistem: ${f.sitasi.length ? f.sitasi.map(nama).join("; ") : `menolak, peringkat 1 ${nama(f.top1)}`}.`)))))));

  const protokol = h("section", { "aria-labelledby": "e-protokol" },
    h("h2", { id: "e-protokol" }, "Cara evaluasi dibuat dan batasnya"),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `${q.total} pertanyaan ditulis tangan: ${q.terjawab} ada jawabannya di korpus dan ${q.tak_terjawab} sengaja tidak ada (sebagian masih seputar K3, sebagian sama sekali di luar topik). Pembagian dev dan test dibekukan di berkas eval/questions.jsonl.`),
      h("li", {}, "Pertanyaan ditulis oleh pengembang setelah membaca peraturannya, jadi bukan pertanyaan nyata pengguna. Angka ini mengukur kemampuan mencari dan mengutip pada pertanyaan yang jelas, bukan kepuasan pengguna sebenarnya."),
      h("li", {}, "Beberapa pertanyaan boleh dijawab oleh lebih dari satu pasal. Jawaban alternatif yang sah dicatat setelah pemeriksaan manual, dan angka \"ketat\" (hanya satu pasal yang dianggap benar) disimpan di hasil mentah."),
      h("li", {}, `Yang disetel hanya ambang penolakan dan pilihan metode, keduanya dari data dev. Pada data dev jawaban benar ${pct(d.jawaban_benar.nilai)} dan menjawab tanpa dasar ${pct(d.dijawab_padahal_tak_terjawab.nilai)}.`),
      h("li", {}, "Pertanyaan relatif sedikit dan banyak berasal dari dokumen yang sama, sehingga rentang kepercayaannya lebar dan sedikit terlalu optimistis."),
      h("li", {}, "Korpus hanya 15 peraturan. Peraturan lain tidak ada, dan peraturan bisa berubah setelah tanggal akses.")));

  const ulang = h("section", { "aria-labelledby": "e-ulang" },
    h("h2", { id: "e-ulang" }, "Ulangi sendiri"),
    h("p", {}, "Hasil di halaman ini berasal dari berkas eval/results.json. Untuk menghitung ulang dari nol:"),
    h("pre", { class: "kode-blok" }, "pip install -e .[dev]\nevidence data fetch   # unduh PDF resmi dan cek SHA-256\nevidence build        # PDF menjadi korpus per pasal\nevidence eval         # tulis eval/results.json\nevidence export       # tulis data situs"));

  clear(main).append(h("div", { class: "halaman halaman-lebar" },
    h("header", {}, h("h1", {}, "Evaluasi"),
      h("p", { class: "lead" }, "Seberapa sering sistem ini mengutip pasal yang tepat, dan seberapa sering ia memilih diam ketika tidak punya dasar. Semua angka di sini dihitung dari pertanyaan yang dikunci sebelum evaluasi, bukan dari contoh pilihan.")),
    hasil, metode, ambang, gagal, protokol, ulang));
  main.dataset.ready = "evaluasi";
}
