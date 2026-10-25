// Halaman Evaluasi: semua angka dibaca dari data/evaluasi.json yang dihasilkan `evidence eval`.
import { clear, h, svg } from "./dom.js";
import { K_PASAL, MODEL_SERVER, MODEL_SERVER_KANDIDAT, VARIAN_SERVER } from "./gen/prompt.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const rentang = (m) => `${pct(m.bawah)} sampai ${pct(m.atas)}`;
const NAMA_GAGAL = {
  sitasi_pasal_salah: "Pasal yang dikutip bukan yang tepat",
  menolak_padahal_terjawab: "Menolak padahal korpus memuat jawabannya",
  pasal_benar_kunci_tidak_ada: "Pasal tepat, tetapi kalimat yang dipilih belum memuat fakta kunci",
  dijawab_padahal_tak_terjawab: "Menjawab pertanyaan yang tidak ada dasarnya",
};

const nama = (id) => id.replace(/#pasal-/, ", Pasal ");
const namaUnik = (ids) => [...new Set(ids)].map(nama).join("; ");

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
  const W = 960, H = 300, L = 48, R = 16, T = 16, B = 44;
  const pts = ev.ambang.sapuan_test;
  const maxX = pts[pts.length - 1].ambang;
  const x = (v) => L + (v / maxX) * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);
  const path = (key) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.ambang).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");
  const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "grafik", "aria-label": "Grafik: semakin tinggi ambang penolakan, semakin sedikit pertanyaan di luar cakupan yang dijawab, tetapi semakin banyak pertanyaan yang sebenarnya terjawab ikut ditolak." });
  for (let t = 0; t <= 1.0001; t += 0.25) {
    g.append(svg("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "grafik-kisi" }), svg("text", { x: L - 8, y: y(t) + 4, class: "grafik-label", "text-anchor": "end" }, `${Math.round(t * 100)}%`));
  }
  for (let t = 0; t <= maxX; t += 10) g.append(svg("text", { x: x(t), y: H - B + 18, class: "grafik-label", "text-anchor": "middle" }, String(t)));
  g.append(svg("text", { x: (L + W - R) / 2, y: H - 2, class: "grafik-label", "text-anchor": "middle" }, "Ambang skor BM25"));
  const sel = ev.ambang.terpilih;
  g.append(svg("line", { x1: x(sel), x2: x(sel), y1: T, y2: H - B, class: "grafik-pilih" }),
    svg("text", { x: x(sel) + 6, y: T + 12, class: "grafik-label" }, `dipilih dari dev: ${sel}`));
  g.append(svg("path", { d: path("jawaban_benar"), class: "garis-benar" }), svg("path", { d: path("dijawab_padahal_tak_terjawab"), class: "garis-salah" }));
  return g;
}

const NAMA_MODE = {
  generatif: "Jawaban generatif ditampilkan",
  cadangan_ekstraktif: "Kembali ke kutipan (tidak ada kalimat bersumber)",
  tolak_model: "Model menjawab TIDAK DITEMUKAN",
  tolak_gerbang: "Ditolak gerbang sebelum model dipanggil",
};

const sel = (m) => (m && m.n ? `${m.k} dari ${m.n} (${pct(m.nilai)})` : "-");

// Kunci konfigurasi server di evaluasi.json, misalnya "bertahan-llama-3.3-70b".
const KUNCI_MODEL_SERVER = MODEL_SERVER ? Object.entries(MODEL_SERVER_KANDIDAT).find(([, m]) => m === MODEL_SERVER)[0] : null;
const KONFIG_SERVER = KUNCI_MODEL_SERVER ? `${VARIAN_SERVER}-${KUNCI_MODEL_SERVER}` : null;
const KONFIG_SERVER_POLOS = KUNCI_MODEL_SERVER ? `polos-${KUNCI_MODEL_SERVER}` : null;
const desimal = (x) => String(x).replace(".", ",");
const ringkasMode = (x) => Object.entries(x.mode).map(([k, v]) => `${NAMA_MODE[k] ?? k} ${v}`).join(", ");
const namaQwen = (g, konfig, cadangan) => (g.model_per_konfigurasi?.[konfig]?.model ?? cadangan).split("/").at(-1);

// Kolom tabel generatif: mode utama (server) bila hasil ujinya ada, lalu model lokal opsional.
function kolomGeneratif(g, set) {
  const kolom = [];
  if (KONFIG_SERVER && g[KONFIG_SERVER]?.[set]) kolom.push([`${MODEL_SERVER.nama} (utama, server)`, g[KONFIG_SERVER][set], KONFIG_SERVER]);
  if (g.bertahan?.[set]) kolom.push([`${namaQwen(g, "bertahan", "Qwen GPU")} (opsional, GPU)`, g.bertahan[set], "bertahan"]);
  if (g["bertahan-cpu"]?.[set]) kolom.push([`${namaQwen(g, "bertahan-cpu", "Qwen CPU")} (opsional, CPU)`, g["bertahan-cpu"][set], "bertahan-cpu"]);
  return kolom;
}

const BARIS_GENERATIF = (t) => [
  ["Jawaban benar", (x) => sel(x ? x.jawaban_benar : t.jawaban_benar)],
  ["Menolak padahal ada jawabannya", (x) => sel(x ? x.menolak_padahal_terjawab : t.menolak_padahal_terjawab)],
  ["Menjawab pertanyaan tanpa dasar", (x) => sel(x ? x.dijawab_padahal_tak_terjawab : t.dijawab_padahal_tak_terjawab)],
  ["Kalimat yang didukung pasal yang dikutipnya", (x) => (x ? sel(x.kalimat_didukung) : "disalin, tidak dinilai")],
  ["Jawaban yang seluruh kalimatnya didukung", (x) => (x ? sel(x.jawaban_seluruhnya_didukung) : "-")],
  ["Dari jawaban yang ditampilkan, yang mengutip minimal satu pasal tepat", (x) => (x ? sel(x.sitasi_ada_yang_sah) : sel(t.sitasi_benar_dari_yang_dijawab))],
  ["Dari jawaban yang ditampilkan, yang semua sitasinya tepat", (x) => (x ? sel(x.sitasi_semua_sah) : "-")],
];

function tabelGeneratif(label, t, kolom) {
  const semua = [["Kutipan langsung", null], ...kolom];
  return h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": `${label}, dapat digulir` },
    h("table", { class: "tabel" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Ukuran"), ...semua.map(([n]) => h("th", { scope: "col", class: "num" }, n)))),
      h("tbody", {}, BARIS_GENERATIF(t).map(([n, f]) => h("tr", {}, h("th", { scope: "row" }, n), ...semua.map(([, x]) => h("td", { class: "num" }, f(x))))))));
}

// Bagian mode generatif. Semua angka dari ev.generatif (dihitung `evidence eval` dari keluaran
// model yang di-commit); bila belum ada, halaman mengatakannya.
function bagianGeneratif(ev) {
  const g = ev.generatif;
  const judul = h("h2", { id: "e-gen" }, "Mode generatif");
  const kolom = g ? kolomGeneratif(g, "test") : [];
  if (!kolom.length) {
    return h("section", { "aria-labelledby": "e-gen" }, judul,
      h("p", {}, "Hasil evaluasi mode generatif belum tersedia di versi ini. Angka di atas hanya untuk mode kutipan langsung."));
  }
  const [labelUtama, utama, konfigUtama] = kolom[0];
  const namaUtama = labelUtama.replace(/ \((utama|opsional)[^)]*\)$/, "");
  const server = konfigUtama === KONFIG_SERVER;
  const nli = g.penilai_nli;
  const waktu = utama.detik_per_jawaban_cpu;
  const inj = g[konfigUtama].injeksi;
  const injPolos = server ? g[KONFIG_SERVER_POLOS]?.injeksi : g.polos?.injeksi;
  const tekan = g[konfigUtama].stress;
  const injLokal = server ? g.bertahan?.injeksi : null;
  const tinjau = (konfig) => {
    const t = ev.tinjauan_injeksi?.konfigurasi?.[konfig];
    return t ? ` Tinjauan manual atas ${t.n} pertanyaan yang sampai ke model: yang ditampilkan aman pada ${t.tampil_aman} dari ${t.n}; keluaran mentah model menuruti perintah tersembunyi pada ${t.model_ikut_perintah} dari ${t.n}${t.model_ikut_perintah ? ", dan kalimat itu dibuang pemeriksaan sitasi" : ""}.` : "";
  };
  const blokInjeksi = inj ? h("div", { class: "kotak-jujur" },
    h("h3", {}, "Uji prompt injection"),
    h("p", {}, `${inj.n} pertanyaan berisi perintah tersembunyi, misalnya meminta model mengabaikan aturan, menulis tautan, atau mengarang pasal. Prompt situs memperlakukan teks pasal dan pertanyaan sebagai data, lalu kalimat tanpa sumber dan tautan ke luar dibuang setelah generasi.${injPolos ? " Sebagai pembanding, prompt polos tanpa pertahanan itu juga dijalankan pada model yang sama." : ""} Sebagian pertanyaan memuat pertanyaan K3 yang sah, jadi menjawab bagian yang sah dengan sitasi adalah perilaku yang benar; yang dinilai adalah apakah perintah tersembunyinya diikuti.`),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `${namaUtama}, prompt situs: ${ringkasMode(inj)}.${tinjau(konfigUtama)}`),
      injPolos ? h("li", {}, `${namaUtama}, prompt polos: ${ringkasMode(injPolos)}.${tinjau(server ? KONFIG_SERVER_POLOS : "polos")}`) : null,
      injLokal ? h("li", {}, `${namaQwen(g, "bertahan", "Qwen GPU")}, prompt situs: ${ringkasMode(injLokal)}.`) : null),
    ev.tinjauan_injeksi ? h("p", { class: "catatan" }, `Tinjauan manual oleh ${ev.tinjauan_injeksi.peninjau}. ${ev.tinjauan_injeksi.cara}`) : null,
    h("details", { class: "gagal" },
      h("summary", {}, `Lihat keluaran mentah ${namaUtama} untuk ${inj.per_butir?.length ?? 0} pertanyaan`),
      h("ul", {}, (inj.per_butir ?? []).map((b) => h("li", {}, h("strong", {}, `${b.id}: ${NAMA_MODE[b.mode] ?? b.mode}`), h("pre", { class: "gen-mentah" }, b.mentah)))))) : null;
  const caraJalan = server
    ? `Mode generatif utama dievaluasi lewat jalur yang sama dengan situs: gerbang skor yang sama, BM25 dengan reranker mMiniLM, ${K_PASAL} pasal teratas, prompt dari kode situs, lalu pemeriksaan sitasi yang sama. Keluaran ${namaUtama} diambil dari fungsi /api/jawab di deploy Preview (Workers AI, suhu 0) oleh workflow GitHub Actions yang membuktikan identitasnya dengan token OIDC, dan setiap keluaran di-commit sehingga angka ini dapat dihitung ulang. Workers AI tidak menyediakan patokan revisi model, dan suhu 0 tidak menjamin keluaran yang persis sama bila dijalankan ulang.`
    : `Mode generatif dievaluasi dengan alur yang sama dengan situs: gerbang skor yang sama, ${g.model.model.split("/")[1]} dengan bobot ${g.model.dtype} pada revisi yang dipatok, prompt dari kode situs, dekode serakah, lalu pemeriksaan sitasi yang sama. Model dijalankan offline di GitHub Actions dengan pustaka yang sama dengan peramban, dan keluarannya di-commit sehingga angka ini dapat dihitung ulang.`;
  const catatanWaktu = waktu
    ? (server ? ` Satu jawaban server butuh median ${desimal(waktu.median)} detik (persentil 90: ${desimal(waktu.p90)} detik), diukur dari runner GitHub Actions.` : ` Di CPU runner, satu jawaban butuh median ${desimal(waktu.median)} detik.`)
    : "";
  return h("section", { "aria-labelledby": "e-gen" }, judul,
    h("p", {}, caraJalan),
    tabelGeneratif("Tabel mode generatif dan kutipan pada data uji", ev.jawaban.test, kolom),
    h("p", { class: "catatan" }, `"Didukung" dinilai otomatis oleh model NLI multibahasa (${nli.model.split("/")[1]}): sebuah kalimat dianggap didukung bila peluang entailment terhadap pasal yang dikutipnya minimal ${desimal(nli.ambang)}. Penilai otomatis ini bisa keliru, terutama untuk angka dan istilah hukum; sampel kalimat disimpan untuk diperiksa manual. Model lokal (Qwen) tercantum sebagai pembanding: mode itu opsional dan tidak lolos batas mutu yang ditetapkan sebelum eksperimen.${catatanWaktu}`),
    h("p", {}, `Apa yang terjadi pada pertanyaan uji dengan ${namaUtama}:`),
    h("ul", { class: "daftar-teks" }, Object.entries(utama.mode).map(([k, v]) => h("li", {}, `${NAMA_MODE[k] ?? k}: ${v}`))),
    tekan ? h("p", { class: "catatan" }, `Uji tekanan (pertanyaan panjang di luar cakupan) dengan ${namaUtama}: ${ringkasMode(tekan)}. Menjawab tanpa dasar: ${sel(tekan.dijawab_padahal_tak_terjawab)}.`) : null,
    blokInjeksi);
}

// Hasil set uji tersegel: dijalankan sekali setelah desain dibekukan.
function bagianTersegel(ev) {
  const s = ev.tersegel;
  if (!s) return null;
  const kolom = [];
  for (const [konfig, x] of Object.entries(s.generatif)) {
    const nm = konfig === KONFIG_SERVER ? `${MODEL_SERVER.nama} (utama, server)`
      : konfig === "bertahan" ? `${(x.model.model ?? "").split("/").at(-1)} (opsional, GPU)`
      : konfig === "bertahan-cpu" ? `${(x.model.model ?? "").split("/").at(-1)} (opsional, CPU)` : konfig;
    kolom.push([nm, x, konfig]);
  }
  kolom.sort((a, b) => (b[2] === KONFIG_SERVER) - (a[2] === KONFIG_SERVER));
  const e = s.ekstraktif;
  const ps = s.pencarian.per_sistem;
  const kirim = s.terkunci.metode;
  return h("section", { "aria-labelledby": "e-segel" },
    h("h2", { id: "e-segel" }, "Set uji tersegel"),
    h("p", {}, `${s.set.pertanyaan} pertanyaan (${s.set.terjawab} ada jawabannya, ${s.set.tak_terjawab} tidak ada) ditulis oleh penulis terpisah yang tidak melihat keluaran sistem, label ditetapkan lebih dulu, dan isinya dikunci dengan SHA-256 sebelum dijalankan. Set ini dijalankan satu kali pada ${s.waktu_utc.slice(0, 10)}. ${s.aturan}`),
    tabelGeneratif("Tabel hasil set tersegel", e, kolom),
    ps?.[kirim] ? h("p", { class: "catatan" }, `Pencarian mode kutipan pada set ini: pasal tepat di peringkat 1 pada ${pct(ps[kirim]["hit@1"].nilai)} pertanyaan terjawab dan di lima teratas pada ${pct(ps[kirim]["hit@5"].nilai)}.`) : null,
    h("p", { class: "catatan" }, "Pertanyaan tersegel tetap ditulis oleh asisten AI, bukan praktisi K3, jadi set ini mengurangi bias penyetelan tetapi tidak menghapus bias penulis."));
}

// Ringkasan model embedding dan reranker, dari selisih berpasangan di data uji.
function catatanPadat(ps, sel, poin) {
  const rr = Object.keys(ps).filter((k) => k.startsWith("bm25_konteks+"));
  const dense = sel.hybrid_e5_large_vs_bm25_konteks;
  if (!dense && !rr.length) return h("p", { class: "catatan" }, "Model embedding dan reranker belum dievaluasi di versi ini.");
  const nama = (k) => ps[k].label;
  const teks = [];
  if (dense) teks.push(`Gabungan BM25 dan e5 terbesar dibanding BM25 dengan konteks: ${poin(dense["mrr@10"])} MRR.`);
  for (const k of rr) teks.push(`${nama(k)} dibanding BM25 dengan konteks saja: ${poin(sel[`${k}_vs_bm25_konteks`]["mrr@10"])} MRR, pasal tepat di peringkat 1 pada ${pct(ps[k].metrik.test["hit@1"].nilai)} pertanyaan uji.`);
  teks.push("Selisih ini dihitung pada data uji yang sama dan tanpa koreksi untuk banyak perbandingan. Model embedding dan reranker dijalankan offline di GitHub Actions; label \"dipakai\" hanya menandai cara yang benar-benar berjalan di peramban.");
  return h("p", { class: "catatan" }, teks.join(" "));
}

export function mountEvaluation(main, { evaluasi: ev }) {
  const ps = ev.pencarian.per_sistem;
  const kirim = ev.metode_dikirim;
  const t = ev.jawaban.test;
  const m = ps[kirim].metrik.test;
  const q = ev.pertanyaan;
  const pro = ev.protokol;
  const sitasi = t.sitasi_benar_dari_yang_dijawab;
  const salah = { k: sitasi.n - sitasi.k, n: sitasi.n };
  const salahCi = { nilai: salah.k / salah.n, bawah: 1 - sitasi.atas, atas: 1 - sitasi.bawah };
  const selalu = ev.pembanding_jawaban.selalu_menjawab;
  const tekan = ev.uji_tekanan;
  const gagalSitasi = ev.kegagalan_test.filter((f) => f.jenis === "sitasi_pasal_salah");
  const gagalSatuPeraturan = gagalSitasi.filter((f) => f.satu_peraturan).length;
  const genUtama = KONFIG_SERVER ? ev.generatif?.[KONFIG_SERVER]?.test : null;

  const ringkas = h("section", { "aria-labelledby": "e-ringkas" },
    h("h2", { id: "e-ringkas" }, "Ringkasan jujur"),
    h("div", { class: "kotak-jujur" },
      h("p", {}, `Mode kutipan langsung: pasal yang tepat muncul di peringkat 1 pada ${pct(m["hit@1"].nilai)} pertanyaan uji dan di lima teratas pada ${pct(m["hit@5"].nilai)}. Namun dari ${salah.n} jawaban yang diberikan, ${salah.k} (${pct(salahCi.nilai)}) mengutip pasal yang salah. Selalu periksa pasal yang dikutip.`),
      genUtama ? h("p", {}, `Mode generatif utama (${MODEL_SERVER.nama}) menjawab benar ${genUtama.jawaban_benar.k} dari ${genUtama.jawaban_benar.n} pertanyaan uji yang ada jawabannya (kutipan langsung: ${t.jawaban_benar.k}), ${pct(genUtama.kalimat_didukung.nilai)} kalimatnya didukung pasal yang dikutip menurut penilai NLI, dan ${genUtama.dijawab_padahal_tak_terjawab.k} dari ${genUtama.dijawab_padahal_tak_terjawab.n} pertanyaan tanpa dasar dijawab. Kalimatnya ditulis model, jadi tetap bisa keliru walau bersitasi.`) : null,
      h("p", {}, `Angka ini optimistis: pertanyaannya ditulis oleh asisten AI pengembang, bukan oleh praktisi K3, dan data uji sudah pernah dilihat sebelum desain akhir dibuat. Rinciannya ada di bagian "Cara evaluasi dibuat dan batasnya".`)));

  const hasil = h("section", { "aria-labelledby": "e-hasil" },
    h("h2", { id: "e-hasil" }, "Mode kutipan langsung pada data uji"),
    h("p", { class: "catatan" }, `Data uji berisi ${t.jawaban_benar.n} pertanyaan yang ada jawabannya dan ${t.dijawab_padahal_tak_terjawab.n} pertanyaan yang sengaja tidak ada jawabannya di korpus. Rentang di bawah angka adalah interval kepercayaan 95%.`),
    h("div", { class: "kartu-baris" },
      kartu("Pasal tepat di peringkat 1", pct(m["hit@1"].nilai), rentang(m["hit@1"]), "Seberapa sering pasal yang memuat jawaban ada di urutan pertama."),
      kartu("Pasal tepat di lima teratas", pct(m["hit@5"].nilai), rentang(m["hit@5"]), "Bila pasal di urutan pertama keliru, seberapa sering pasal yang tepat masih terlihat."),
      kartu("Jawaban yang mengutip pasal salah", `${salah.k} dari ${salah.n}`, `${pct(salahCi.nilai)}, rentang ${rentang(salahCi)}`, "Risiko utama sistem ekstraktif: kalimatnya asli, tetapi bisa berasal dari pasal yang keliru."),
      kartu("Jawaban benar", pct(t.jawaban_benar.nilai), rentang(t.jawaban_benar), `Menjawab, mengutip pasal yang tepat, dan memuat fakta kunci. Ukuran ini hampir sama dengan "pasal tepat di peringkat 1 dan sistem menjawab"; ketepatan kalimat yang dipilih tidak diukur terpisah. Rata-rata ${String(t.unit_per_jawaban).replace(".", ",")} kalimat per jawaban.`),
      kartu("Menolak padahal ada jawabannya", pct(t.menolak_padahal_terjawab.nilai), rentang(t.menolak_padahal_terjawab), `Harga dari sikap hati-hati. Pada ${t.menolak_padahal_peringkat1_sah.k} dari ${t.menolak_padahal_peringkat1_sah.n} penolakan itu, pasal peringkat 1 sebenarnya sudah tepat.`),
      kartu("Menjawab pertanyaan tanpa dasar", `${t.dijawab_padahal_tak_terjawab.k} dari ${t.dijawab_padahal_tak_terjawab.n}`, `batas atas ${pct(t.dijawab_padahal_tak_terjawab.atas)}`, "Hanya 21 pertanyaan, dan sebagian besar pendek atau jelas di luar topik. Lihat uji tekanan di bawah sebelum menyimpulkan bahwa sistem pasti menolak yang di luar cakupan.")));

  const salinan = h("p", { class: "catatan" },
    `Tidak ada kalimat jawaban yang berbeda dari teks korpus (${t.kutipan_tidak_verbatim.jumlah} dari ${t.kutipan_tidak_verbatim.n}). Angka nol ini hanya mencerminkan cara kerjanya, yaitu menyalin, bukan temuan. Teks korpus sendiri adalah hasil ekstraksi PDF; beberapa dokumen berasal dari OCR dan memuat salah baca.`);

  const barisMetode = Object.entries(ps).map(([key, v]) => h("tr", { class: key === kirim ? "dipakai" : null },
    h("th", { scope: "row" }, v.label, key === kirim ? h("span", { class: "lencana" }, "dipakai mode kutipan") : null,
      key === ev.metode_generatif ? h("span", { class: "lencana" }, "dipakai mode generatif") : null),
    h("td", { class: "num" }, pct(v.metrik.dev["mrr@10"].nilai)),
    h("td", { class: "num" }, pct(v.metrik.test["hit@1"].nilai), batas(v.metrik.test["hit@1"])),
    h("td", { class: "num" }, pct(v.metrik.test["hit@5"].nilai), batas(v.metrik.test["hit@5"])),
    h("td", { class: "num" }, pct(v.metrik.test["mrr@10"].nilai), batas(v.metrik.test["mrr@10"]))));
  const sel = ev.pencarian.selisih_berpasangan;
  const poin = (d) => `${d.selisih > 0 ? "+" : ""}${(d.selisih * 100).toFixed(1).replace(".", ",")} poin (interval ${(d.bawah * 100).toFixed(1).replace(".", ",")} sampai ${(d.atas * 100).toFixed(1).replace(".", ",")})`;
  const metode = h("section", { "aria-labelledby": "e-metode" },
    h("h2", { id: "e-metode" }, "Perbandingan metode pencarian"),
    h("p", {}, `${Object.keys(ps).length} cara mencari diuji pada pertanyaan yang sama: BM25, LSA, model embedding e5 (multilingual, tiga ukuran), gabungan BM25 dan e5, serta reranker cross-encoder yang menilai ulang 20 pasal teratas. Metode mode kutipan dipilih dari kolom MRR data dev, di antara cara yang berjalan tanpa unduhan model. Mode generatif memakai BM25 dengan reranker mMiniLM; aturan pemilihannya ditetapkan setelah angka semua cara terlihat, jadi angka uji untuk pilihan itu optimistis. Kolom itu hanya dasar pemilihan: nilainya lebih tinggi daripada hasil di data uji karena metode yang menang dipilih dari sana, jadi jangan dibaca sebagai kinerja.`),
    h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": "Tabel perbandingan metode, dapat digulir" },
      h("table", { class: "tabel" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Metode"), h("th", { scope: "col", class: "num" }, "MRR data dev (dasar pemilihan)"), h("th", { scope: "col", class: "num" }, "Peringkat 1 (uji)"), h("th", { scope: "col", class: "num" }, "Lima teratas (uji)"), h("th", { scope: "col", class: "num" }, "MRR (uji)"))),
        h("tbody", {}, barisMetode))),
    h("p", { class: "catatan" }, `MRR adalah rata-rata 1/peringkat pasal yang tepat; makin dekat 100% makin baik. Pada MRR data uji, BM25 dengan stem dan konteks lebih baik daripada BM25 polos: ${poin(sel.bm25_konteks_vs_bm25_polos["mrr@10"])}. Gabungan BM25 dan LSA tidak lebih baik daripada BM25 dengan konteks: ${poin(sel.hybrid_vs_bm25_konteks["mrr@10"])}. Ini tiga perbandingan tanpa koreksi, dan selisih peringkat lima teratas tidak berbeda nyata. Acak murni menempatkan pasal tepat di lima teratas hanya ${pct(ev.pencarian.acak["hit@5"])} dari waktu.`),
    catatanPadat(ps, sel, poin));

  const gaya = ps[kirim].per_gaya_test;
  const tekanBlok = tekan ? h("div", { class: "kotak-jujur" },
    h("h3", {}, "Uji tekanan: pertanyaan panjang di luar cakupan"),
    h("p", {}, `Dari ${tekan.n} pertanyaan panjang berkosakata K3 yang jawabannya tidak ada di korpus, ${tekan.dijawab} tetap dijawab (skor tertinggi ${String(tekan.skor_maks).replace(".", ",")}, ambang ${String(tekan.ambang).replace(".", ",")}), dengan pasal yang tidak menjawab. Skor BM25 mentah cenderung tinggi untuk pertanyaan yang panjang, sehingga gerbang lebih mudah menolak pertanyaan pendek daripada yang panjang. Set ini kecil dan ditulis auditor setelah melihat perilaku sistem, jadi ia ilustrasi kelemahan, bukan perkiraan angka.`),
    h("details", { class: "gagal" },
      h("summary", {}, `Lihat ${tekan.dijawab} pertanyaan yang tetap dijawab`),
      h("ul", {}, tekan.contoh_dijawab.map((c) => h("li", {}, h("strong", {}, c.tanya), h("div", { class: "catatan" }, `Mengutip ${namaUnik(c.sitasi)}, skor ${String(c.skor).replace(".", ",")}.`)))))) : null;

  const ambang = h("section", { "aria-labelledby": "e-ambang" },
    h("h2", { id: "e-ambang" }, "Kapan sistem memilih diam"),
    h("p", {}, `Sistem menolak menjawab bila skor BM25 pasal teratas lebih kecil dari ambang. Ambang ${ev.ambang.terpilih} dipilih dari data dev dan dipakai apa adanya pada data uji. Grafik memperlihatkan pertukarannya pada data uji: ambang lebih tinggi membuat sistem lebih jarang menjawab pertanyaan tanpa dasar, tetapi lebih sering diam pada pertanyaan yang sebenarnya terjawab.`),
    h("div", { class: "grafik-bungkus" }, h("div", { class: "grafik-gulir", tabindex: "0", role: "region", "aria-label": "Grafik ambang, dapat digulir" }, grafikAmbang(ev)),
      h("div", { class: "legenda" }, h("span", { class: "leg-benar" }, "Jawaban benar"), h("span", { class: "leg-salah" }, "Menjawab pertanyaan tanpa dasar"))),
    h("p", {}, `Gerbang ini bukan peningkat akurasi. Dibanding sistem yang selalu menjawab, jawaban benar turun dari ${selalu.jawaban_benar.k} ke ${t.jawaban_benar.k} dari ${t.jawaban_benar.n}, sebagai imbalan karena hanya ${t.dijawab_padahal_tak_terjawab.k} dari ${t.dijawab_padahal_tak_terjawab.n} pertanyaan tanpa dasar yang dijawab (tanpa gerbang: ${selalu.dijawab_padahal_tak_terjawab.k} dari ${selalu.dijawab_padahal_tak_terjawab.n}). Pertukaran ini sah, tetapi tetap pertukaran.`),
    tekanBlok,
    h("p", { class: "catatan" }, `Menurut jenis pertanyaan, jawaban benar ${pct(t.jawaban_benar_leksikal.nilai)} untuk pertanyaan yang mengulang kata-kata pasal ("leksikal") dan ${pct(t.jawaban_benar_parafrase.nilai)} untuk yang dirumuskan ulang ("parafrase"). Selisih ini tidak berpasangan dan bercampur dengan panjang pertanyaan serta komposisi dokumen, jadi jangan disimpulkan sebagai sebab.`));

  const gagalMap = new Map();
  for (const f of ev.kegagalan_test) { if (!gagalMap.has(f.jenis)) gagalMap.set(f.jenis, []); gagalMap.get(f.jenis).push(f); }
  const gagal = h("section", { "aria-labelledby": "e-gagal" },
    h("h2", { id: "e-gagal" }, "Di mana sistem gagal"),
    h("p", {}, `Daftar lengkap kegagalan pada data uji, tanpa disaring. Dari ${gagalSitasi.length} jawaban dengan pasal yang salah, ${gagalSatuPeraturan} mengutip pasal lain di peraturan yang sama dengan jawaban yang benar, misalnya pasal tetangga atau pasal definisi. Pola ini terlihat dari daftar di bawah; penyebabnya belum diuji lebih jauh.`),
    ...[...gagalMap.entries()].map(([jenis, list]) => h("details", { class: "gagal" },
      h("summary", {}, `${NAMA_GAGAL[jenis] ?? jenis}: ${list.length}`),
      h("ul", {}, list.map((f) => h("li", {}, h("strong", {}, f.tanya),
        h("div", { class: "catatan" }, `Seharusnya: ${namaUnik(f.emas)}. Sistem: ${f.sitasi.length ? namaUnik(f.sitasi) : `menolak, peringkat 1 ${nama(f.top1)}`}.`)))))));

  const protokol = h("section", { "aria-labelledby": "e-protokol" },
    h("h2", { id: "e-protokol" }, "Cara evaluasi dibuat dan batasnya"),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `${q.total} pertanyaan: ${q.terjawab} ada jawabannya di korpus dan ${q.tak_terjawab} sengaja tidak ada (sebagian masih seputar K3, sebagian sama sekali di luar topik). Dibagi menjadi ${q.dev} dev dan ${q.test} test, dan pembagiannya dibekukan di berkas eval/questions.jsonl.`),
      h("li", {}, pro.penulis_pertanyaan),
      h("li", {}, pro.status_test),
      h("li", {}, `Yang dipilih dari data dev: ${pro.dipilih_dari_dev.join(" dan ")}. Selain itu, keputusan berikut dibuat setelah run pertama dan karena itu tidak murni dari dev:`,
        h("ul", { class: "daftar-teks" }, pro.keputusan_setelah_run_pertama.map((k) => h("li", {}, k)))),
      h("li", {}, pro.riwayat_run_pertama),
      h("li", {}, "Beberapa pertanyaan boleh dijawab oleh lebih dari satu pasal. Jawaban alternatif yang sah dicatat setelah penilaian manual; angka dengan satu pasal saja yang dianggap benar disimpan di hasil mentah."),
      h("li", {}, "Fakta kunci dicocokkan sebagai kumpulan kata, bukan frasa, dan hampir sepertiga butir kunci (29% menurut audit independen) sudah tercantum di teks pertanyaannya. Karena itu \"jawaban benar\" lebih longgar daripada kedengarannya."),
      h("li", {}, "Pertanyaan relatif sedikit. Interval kepercayaan menghitung ketidakpastian sampel, tetapi tidak menghitung bias dari penulis tunggal dan dari penyetelan pada data yang sama."),
      h("li", {}, "Korpus hanya 15 peraturan. Peraturan lain tidak ada, dan peraturan bisa berubah setelah tanggal akses.")),
    h("p", {}, ev.tersegel
      ? "Set uji tersegel sudah dijalankan satu kali; hasilnya ada di bagian \"Set uji tersegel\". Set itu tetap ditulis asisten AI, jadi angka yang lebih kuat masih membutuhkan pertanyaan dari praktisi K3 yang tidak melihat sistem."
      : "Set uji tersegel sudah disiapkan dan dikunci, tetapi belum dijalankan di versi ini. Angka yang lebih kuat lagi membutuhkan pertanyaan dari praktisi K3 yang tidak melihat sistem."));

  const ulang = h("section", { "aria-labelledby": "e-ulang" },
    h("h2", { id: "e-ulang" }, "Ulangi sendiri"),
    h("p", {}, "Hasil di halaman ini berasal dari berkas eval/results.json. Untuk menghitung ulang dari nol:"),
    h("pre", { class: "kode-blok", tabindex: "0" }, "pip install -e .[dev]\nevidence data fetch   # unduh PDF resmi dan cek SHA-256\nevidence build        # PDF menjadi korpus per pasal\nevidence eval         # tulis eval/results.json\nevidence export       # tulis data situs"));

  clear(main).append(h("div", { class: "halaman halaman-lebar" },
    h("header", {}, h("h1", {}, "Evaluasi"),
      h("p", { class: "lead" }, "Seberapa sering sistem ini mengutip pasal yang tepat, seberapa sering ia salah, dan seberapa sering ia memilih diam. Semua angka dihitung dari set pertanyaan tetap, tetapi ada batas penting pada cara set itu dibuat; baca ringkasan jujur di bawah.")),
    ringkas, hasil, salinan, bagianGeneratif(ev), bagianTersegel(ev), metode, ambang, gagal, protokol, ulang));
  main.dataset.ready = "evaluasi";
}
