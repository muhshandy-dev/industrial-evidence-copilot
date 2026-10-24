// Halaman Cara kerja dan batas. Daftar dokumen dibaca dari data/korpus.json, bukan ditulis ulang di sini.
import { clear, h } from "./dom.js";

const LANGKAH = [
  ["Ambil dokumen resmi", "Setiap peraturan diunduh dari JDIH Kementerian Ketenagakerjaan. Berkasnya dicatat dengan SHA-256, jadi siapa pun dapat memastikan teks yang dipakai sama dengan yang diunduh."],
  ["Pecah per pasal", "Teks PDF dipecah menjadi satu bagian untuk setiap pasal, lengkap dengan bab dan judul babnya. Nomor pasal yang rusak karena OCR diperbaiki dan dicatat."],
  ["Bangun indeks", "Teks dinormalkan (huruf kecil, kata dasar sederhana, ejaan lama disamakan) lalu dihitung bobot tiap kata dengan BM25. Judul dokumen dan bab ikut dipakai sebagai konteks pencarian, tetapi tidak muncul di kutipan."],
  ["Cari di peramban", "Pertanyaan Anda diolah dengan cara yang sama dan dicocokkan dengan indeks. Seluruh proses berjalan di peramban Anda; pertanyaan tidak dikirim ke server."],
  ["Putuskan menjawab atau diam", "Bila skor pasal teratas lebih rendah dari ambang yang dipilih dari data dev, sistem menolak menjawab dan hanya menunjukkan pasal terdekat."],
  ["Kutip, jangan menulis", "Kalimat jawaban dipilih dari ayat atau butir di pasal peringkat 1 dan disalin apa adanya. Tidak ada model bahasa yang menulis kalimat baru."],
];

function ringkasHash(s) { return `${s.slice(0, 10)}…${s.slice(-6)}`; }

function tabelDokumen(korpus) {
  const hitung = new Map();
  for (const c of korpus.chunk) hitung.set(c.dok, (hitung.get(c.dok) ?? 0) + 1);
  const baris = korpus.dokumen.map((d, i) => {
    const catatan = [d.ocr ? "teks hasil OCR" : null, d.ejaan_lama ? "ejaan lama" : null].filter(Boolean).join(", ");
    return h("tr", {},
      h("th", { scope: "row" }, d.judul, h("span", { class: "sub" }, d.tentang)),
      h("td", { class: "kiri" }, d.status_jdih),
      h("td", { class: "kiri" }, d.tanggal_akses),
      h("td", { class: "num" }, String(hitung.get(i) ?? 0)),
      h("td", { class: "kiri mono", title: d.sha256 }, ringkasHash(d.sha256)),
      h("td", { class: "kiri" }, catatan || "-"),
      h("td", { class: "kiri" }, h("a", { href: d.url, rel: "noopener noreferrer" }, "Halaman JDIH")));
  });
  return h("div", { class: "tabel-bungkus", tabindex: "0", role: "region", "aria-label": "Daftar dokumen sumber, dapat digulir" },
    h("table", { class: "tabel" },
      h("thead", {}, h("tr", {}, ...["Dokumen", "Status di JDIH", "Diakses", "Pasal", "SHA-256 PDF", "Catatan teks", "Sumber"].map((t) => h("th", { scope: "col" }, t)))),
      h("tbody", {}, baris)));
}

export function mountMethod(main, { korpus, evaluasi }) {
  const dikecualikan = korpus.dikecualikan ?? [];
  const intro = h("header", {},
    h("h1", {}, "Cara kerja dan batas"),
    h("p", { class: "lead" }, "Situs ini adalah mesin pencari bukti untuk peraturan K3. Ia menunjukkan pasal yang relevan dan mengutipnya persis. Ia bukan chatbot yang menulis jawaban sendiri, dan bukan penasihat hukum."));

  const jenis = h("section", { "aria-labelledby": "m-jenis" },
    h("h2", { id: "m-jenis" }, "Apakah ini AI generatif?"),
    h("div", { class: "kotak-jujur" },
      h("p", {}, "Tidak. Jawaban di situs ini bersifat ekstraktif: sistem memilih kalimat yang sudah ada di peraturan, tidak menulis kalimat baru. Karena itu kutipannya selalu dapat dicocokkan dengan teks aslinya, dan tidak ada kalimat karangan."),
      h("p", {}, "Yang tetap bisa salah adalah pemilihannya: sistem dapat mengutip pasal yang keliru, atau menjawab pertanyaan yang sebenarnya tidak dijawab oleh korpus. Dua kegagalan itu yang diukur di halaman Evaluasi.")));

  const alur = h("section", { "aria-labelledby": "m-alur" },
    h("h2", { id: "m-alur" }, "Alur dari dokumen sampai kutipan"),
    h("ol", { class: "langkah" }, LANGKAH.map(([judul, isi]) => h("li", {}, h("div", {}, h("h3", {}, judul), h("p", {}, isi))))));

  const hosting = h("section", { "aria-labelledby": "m-host" },
    h("h2", { id: "m-host" }, "Hosting dan inferensi"),
    h("p", {}, "Situs ini sepenuhnya statis di Cloudflare Pages. Indeks dan korpus diunduh sekali ke peramban, lalu pencarian dihitung di sana. Tidak ada server aplikasi, tidak ada basis data, dan tidak ada API berbayar. Karena tidak ada server yang harus \"bangun\", tidak ada jeda mulai dingin seperti pada layanan gratis yang tidur saat sepi."),
    h("p", {}, "Konsekuensinya, kemampuan pencarian dibatasi oleh apa yang realistis berjalan di peramban: BM25 dengan konteks. Pencarian semantik dengan model embedding bahasa Indonesia belum dipasang di situs ini. Variasi LSA diuji secara offline dan tidak lebih baik, sehingga tidak dimasukkan."));

  const dokumen = h("section", { "aria-labelledby": "m-dok" },
    h("h2", { id: "m-dok" }, `Dokumen sumber (${korpus.dokumen.length})`),
    h("p", {}, "Semua dokumen adalah peraturan perundang-undangan yang diunduh dari JDIH Kementerian Ketenagakerjaan. Status \"Berlaku\" adalah yang tertera di JDIH pada tanggal akses; ini bukan jaminan bahwa peraturan belum diubah atau dicabut."),
    tabelDokumen(korpus),
    korpus.peringatan_ekstraksi?.length ? h("details", { class: "gagal" },
      h("summary", {}, `Perbaikan hasil ekstraksi teks: ${korpus.peringatan_ekstraksi.length}`),
      h("ul", { class: "daftar-teks" }, korpus.peringatan_ekstraksi.map((t) => h("li", {}, t)))) : null,
    dikecualikan.length ? h("details", { class: "gagal" },
      h("summary", {}, `Peraturan yang sengaja tidak dimasukkan: ${dikecualikan.length}`),
      h("p", { class: "catatan" }, "Dicoba diambil tetapi dikeluarkan karena kualitas teksnya tidak layak dikutip. Lebih baik tidak ada daripada dikutip salah."),
      h("ul", { class: "daftar-teks" }, dikecualikan.map((d) => h("li", {}, h("strong", {}, d.judul), `: ${d.alasan}`)))) : null);

  const lisensi = h("section", { "aria-labelledby": "m-lisensi" },
    h("h2", { id: "m-lisensi" }, "Lisensi dan dasar hukum penggunaan"),
    h("p", {}, "Teks peraturan perundang-undangan tidak memiliki hak cipta. Dasarnya Pasal 42 huruf b Undang-Undang Nomor 28 Tahun 2014 tentang Hak Cipta, yang mengecualikan peraturan perundang-undangan dari objek hak cipta."),
    h("div", { class: "peringatan" }, h("p", {}, "Rujukan pasal itu diambil dari sumber sekunder. Teks resmi di peraturan.bpk.go.id belum dapat dibuka dari lingkungan pengembangan, jadi nomor pasalnya perlu dicek manual sebelum dijadikan pegangan. Halaman ini bukan nasihat hukum.")),
    h("p", {}, "Kode program situs berlisensi MIT. Kutipan peraturan tetap milik publik dan tetap harus dirujuk ke sumber resminya."));

  const batas = h("section", { "aria-labelledby": "m-batas" },
    h("h2", { id: "m-batas" }, "Batas yang perlu Anda ketahui"),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `Cakupannya ${korpus.dokumen.length} peraturan K3, bukan seluruh hukum Indonesia. Pertanyaan di luar itu seharusnya ditolak.`),
      h("li", {}, "Peraturan bisa berubah. Periksa selalu versi terbaru di sumber resmi sebelum mengambil keputusan."),
      h("li", {}, "Pertanyaan yang jawabannya tersebar di beberapa pasal atau beberapa peraturan hanya dijawab sebagian: sistem mengutip dari satu pasal."),
      h("li", {}, "Pertanyaan evaluasi ditulis oleh pengembang, jadi angka di halaman Evaluasi tidak dapat dibaca sebagai kepuasan pengguna sebenarnya."),
      h("li", {}, "Jawaban untuk keputusan hukum, sanksi, atau audit sebaiknya dikonfirmasi ke ahli K3 atau konsultan hukum.")));

  const jejak = h("section", { "aria-labelledby": "m-jejak" },
    h("h2", { id: "m-jejak" }, "Kode dan data"),
    h("p", {}, `Pembagian pertanyaan dev dan test dibekukan (${evaluasi.pertanyaan.dev} dan ${evaluasi.pertanyaan.test}). Berkas hasil, korpus, dan seluruh langkah untuk mengulang perhitungan ada di repositori GitHub proyek ini; petunjuknya ada di bagian akhir halaman Evaluasi.`));

  clear(main).append(h("div", { class: "halaman halaman-lebar" }, intro, jenis, alur, hosting, dokumen, lisensi, batas, jejak));
  main.dataset.ready = "metode";
}
