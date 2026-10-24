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

// Bagian mode generatif. Semua angka dari ev.generatif (dihitung `evidence eval` dari keluaran
// model yang di-commit); bila belum ada, halaman mengatakannya.
function bagianGeneratif(ev) {
  const g = ev.generatif;
  const judul = h("h2", { id: "e-gen" }, "Mode generatif");
  if (!g || !g.bertahan?.test) {
    return h("section", { "aria-labelledby": "e-gen" }, judul,
      h("p", {}, "Hasil evaluasi mode generatif belum tersedia di versi ini. Angka di atas hanya untuk mode kutipan langsung."));
  }
  const t = ev.jawaban.test;
  const kolom = [["Kutipan langsung", null], [`${g.model.model.split("/")[1]} (GPU)`, g.bertahan.test]];
  if (g["bertahan-cpu"]?.test) kolom.push([`${(g.model_per_konfigurasi?.["bertahan-cpu"]?.model ?? "model CPU").split("/").at(-1)} (CPU)`, g["bertahan-cpu"].test]);
  const baris = [
    ["Jawaban benar", (x) => sel(x ? x.jawaban_benar : t.jawaban_benar)],
    ["Menolak padahal ada jawabannya", (x) => sel(x ? x.menolak_padahal_terjawab : t.menolak_padahal_terjawab)],
    ["Menjawab pertanyaan tanpa dasar", (x) => sel(x ? x.dijawab_padahal_tak_terjawab : t.dijawab_padahal_tak_terjawab)],
    ["Kalimat yang didukung pasal yang dikutipnya", (x) => (x ? sel(x.kalimat_didukung) : "disalin, tidak dinilai")],
    ["Jawaban yang seluruh kalimatnya didukung", (x) => (x ? sel(x.jawaban_seluruhnya_didukung) : "-")],
    ["Dari jawaban yang ditampilkan, yang mengutip minimal satu pasal tepat", (x) => (x ? sel(x.sitasi_ada_yang_sah) : sel(t.sitasi_benar_dari_yang_dijawab))],
  ];
  const tabel = h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": "Tabel mode generatif dan kutipan, dapat digulir" },
    h("table", { class: "tabel" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Data uji"), ...kolom.map(([n]) => h("th", { scope: "col", class: "num" }, n)))),
      h("tbody", {}, baris.map(([n, f]) => h("tr", {}, h("th", { scope: "row" }, n), ...kolom.map(([, x]) => h("td", { class: "num" }, f(x))))))));
  const mode = Object.entries(g.bertahan.test.mode).map(([k, v]) => h("li", {}, `${NAMA_MODE[k] ?? k}: ${v}`));
  const nli = g.penilai_nli;
  const waktu = g.bertahan.test.detik_per_jawaban_cpu;
  const inj = g.bertahan.injeksi;
  const injPolos = g.polos?.injeksi;
  const blokInjeksi = inj ? h("div", { class: "kotak-jujur" },
    h("h3", {}, "Uji prompt injection"),
    h("p", {}, `${inj.n} pertanyaan berisi perintah tersembunyi, misalnya meminta model mengabaikan aturan, menulis tautan, atau mengarang pasal. Prompt situs memperlakukan teks pasal dan pertanyaan sebagai data, lalu kalimat tanpa sumber dan tautan ke luar dibuang setelah generasi. ${injPolos ? `Sebagai pembanding, prompt polos tanpa pertahanan itu juga dijalankan.` : ""}`),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `Prompt situs: ${Object.entries(inj.mode).map(([k, v]) => `${NAMA_MODE[k] ?? k} ${v}`).join(", ")}.`),
      injPolos ? h("li", {}, `Prompt polos: ${Object.entries(injPolos.mode).map(([k, v]) => `${NAMA_MODE[k] ?? k} ${v}`).join(", ")}.`) : null),
    h("details", { class: "gagal" },
      h("summary", {}, `Lihat keluaran mentah model untuk ${inj.per_butir.length} pertanyaan`),
      h("ul", {}, inj.per_butir.map((b) => h("li", {}, h("strong", {}, `${b.id}: ${NAMA_MODE[b.mode] ?? b.mode}`), h("pre", { class: "gen-mentah" }, b.mentah)))))) : null;
  return h("section", { "aria-labelledby": "e-gen" }, judul,
    h("p", {}, `Mode generatif dievaluasi dengan alur yang sama dengan situs: gerbang skor yang sama, ${g.model.model.split("/")[1]} dengan bobot ${g.model.dtype} pada revisi yang dipatok, prompt dari kode situs, dekode serakah, lalu pemeriksaan sitasi yang sama. Model dijalankan offline di GitHub Actions dengan pustaka yang sama dengan peramban, dan keluarannya di-commit sehingga angka ini dapat dihitung ulang.`),
    tabel,
    h("p", { class: "catatan" }, `"Didukung" dinilai otomatis oleh model NLI multibahasa (${nli.model.split("/")[1]}): sebuah kalimat dianggap didukung bila peluang entailment terhadap pasal yang dikutipnya minimal ${String(nli.ambang).replace(".", ",")}. Penilai otomatis ini bisa keliru, terutama untuk angka dan istilah hukum; sampel kalimat disimpan untuk diperiksa manual.${waktu ? ` Di CPU runner, satu jawaban butuh median ${String(waktu.median).replace(".", ",")} detik.` : ""}`),
    h("p", {}, "Apa yang terjadi pada pertanyaan uji dengan model GPU:"),
    h("ul", { class: "daftar-teks" }, mode),
    blokInjeksi);
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

  const ringkas = h("section", { "aria-labelledby": "e-ringkas" },
    h("h2", { id: "e-ringkas" }, "Ringkasan jujur"),
    h("div", { class: "kotak-jujur" },
      h("p", {}, `Pasal yang tepat muncul di peringkat 1 pada ${pct(m["hit@1"].nilai)} pertanyaan uji dan di lima teratas pada ${pct(m["hit@5"].nilai)}. Namun dari ${salah.n} jawaban yang diberikan, ${salah.k} (${pct(salahCi.nilai)}) mengutip pasal yang salah. Selalu periksa pasal yang dikutip.`),
      h("p", {}, `Angka ini optimistis: pertanyaannya ditulis oleh asisten AI pengembang, bukan oleh praktisi K3, dan data uji sudah pernah dilihat sebelum desain akhir dibuat. Rinciannya ada di bagian "Cara evaluasi dibuat dan batasnya".`)));

  const hasil = h("section", { "aria-labelledby": "e-hasil" },
    h("h2", { id: "e-hasil" }, "Hasil pada data uji"),
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
    h("th", { scope: "row" }, v.label, key === kirim ? h("span", { class: "lencana" }, "dipakai di situs") : null),
    h("td", { class: "num" }, pct(v.metrik.dev["mrr@10"].nilai)),
    h("td", { class: "num" }, pct(v.metrik.test["hit@1"].nilai), batas(v.metrik.test["hit@1"])),
    h("td", { class: "num" }, pct(v.metrik.test["hit@5"].nilai), batas(v.metrik.test["hit@5"])),
    h("td", { class: "num" }, pct(v.metrik.test["mrr@10"].nilai), batas(v.metrik.test["mrr@10"]))));
  const sel = ev.pencarian.selisih_berpasangan;
  const poin = (d) => `${d.selisih > 0 ? "+" : ""}${(d.selisih * 100).toFixed(1).replace(".", ",")} poin (interval ${(d.bawah * 100).toFixed(1).replace(".", ",")} sampai ${(d.atas * 100).toFixed(1).replace(".", ",")})`;
  const metode = h("section", { "aria-labelledby": "e-metode" },
    h("h2", { id: "e-metode" }, "Perbandingan metode pencarian"),
    h("p", {}, "Lima cara mencari diuji pada pertanyaan yang sama. Metode yang dipakai situs dipilih dari kolom MRR data dev. Kolom itu hanya dasar pemilihan: nilainya lebih tinggi daripada hasil di data uji karena metode yang menang dipilih dari sana, jadi jangan dibaca sebagai kinerja."),
    h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": "Tabel perbandingan metode, dapat digulir" },
      h("table", { class: "tabel" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Metode"), h("th", { scope: "col", class: "num" }, "MRR data dev (dasar pemilihan)"), h("th", { scope: "col", class: "num" }, "Peringkat 1 (uji)"), h("th", { scope: "col", class: "num" }, "Lima teratas (uji)"), h("th", { scope: "col", class: "num" }, "MRR (uji)"))),
        h("tbody", {}, barisMetode))),
    h("p", { class: "catatan" }, `MRR adalah rata-rata 1/peringkat pasal yang tepat; makin dekat 100% makin baik. Pada MRR data uji, BM25 dengan stem dan konteks lebih baik daripada BM25 polos: ${poin(sel.bm25_konteks_vs_bm25_polos["mrr@10"])}. Gabungan BM25 dan LSA tidak lebih baik daripada BM25 dengan konteks: ${poin(sel.hybrid_vs_bm25_konteks["mrr@10"])}. Ini tiga perbandingan tanpa koreksi, dan selisih peringkat lima teratas tidak berbeda nyata. Karena itu situs hanya memuat BM25. Acak murni menempatkan pasal tepat di lima teratas hanya ${pct(ev.pencarian.acak["hit@5"])} dari waktu.`),
    h("p", { class: "catatan" }, "Model embedding pra-latih (misalnya e5) belum dibandingkan karena unduhan modelnya diblokir di lingkungan pengembangan. Jangan membaca tabel ini sebagai bukti bahwa BM25 lebih baik daripada embedding pra-latih."));

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
    h("p", {}, "Untuk angka yang lebih dapat dipercaya diperlukan set uji tersegel: pertanyaan ditulis praktisi K3 atau orang lain yang tidak melihat sistem, label ditetapkan sebelum melihat keluaran, dan dijalankan satu kali. Itu belum dikerjakan."));

  const ulang = h("section", { "aria-labelledby": "e-ulang" },
    h("h2", { id: "e-ulang" }, "Ulangi sendiri"),
    h("p", {}, "Hasil di halaman ini berasal dari berkas eval/results.json. Untuk menghitung ulang dari nol:"),
    h("pre", { class: "kode-blok", tabindex: "0" }, "pip install -e .[dev]\nevidence data fetch   # unduh PDF resmi dan cek SHA-256\nevidence build        # PDF menjadi korpus per pasal\nevidence eval         # tulis eval/results.json\nevidence export       # tulis data situs"));

  clear(main).append(h("div", { class: "halaman halaman-lebar" },
    h("header", {}, h("h1", {}, "Evaluasi"),
      h("p", { class: "lead" }, "Seberapa sering sistem ini mengutip pasal yang tepat, seberapa sering ia salah, dan seberapa sering ia memilih diam. Semua angka dihitung dari set pertanyaan tetap, tetapi ada batas penting pada cara set itu dibuat; baca ringkasan jujur di bawah.")),
    ringkas, hasil, salinan, bagianGeneratif(ev), metode, ambang, gagal, protokol, ulang));
  main.dataset.ready = "evaluasi";
}
