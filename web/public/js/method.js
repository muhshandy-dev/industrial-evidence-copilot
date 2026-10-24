// Halaman Cara kerja dan batas. Daftar dokumen dibaca dari data/korpus.json, bukan ditulis ulang di sini.
import { clear, h } from "./dom.js";
import { K_PASAL, MAX_TOKEN_BARU, MODEL, MODEL_CPU } from "./gen/prompt.js";
import { PUSTAKA, UKURAN_UNDUHAN_MB } from "./gen/runtime.js";

const namaModel = (m) => m.id.split("/")[1];

const LANGKAH = [
  ["Ambil dokumen resmi", "Setiap peraturan diunduh dari JDIH Kementerian Ketenagakerjaan. Berkasnya dicatat dengan SHA-256, jadi siapa pun dapat memastikan teks yang dipakai sama dengan yang diunduh."],
  ["Pecah per pasal", "Teks PDF dipecah menjadi satu bagian untuk setiap pasal, lengkap dengan bab dan judul babnya. Nomor pasal yang rusak karena OCR diperbaiki dan dicatat."],
  ["Bangun indeks", "Teks dinormalkan (huruf kecil, kata dasar sederhana, ejaan lama disamakan) lalu dihitung bobot tiap kata dengan BM25. Judul dokumen dan bab ikut dipakai sebagai konteks pencarian, tetapi tidak muncul di kutipan."],
  ["Cari di peramban", "Pertanyaan Anda diolah dengan cara yang sama dan dicocokkan dengan indeks. Seluruh proses berjalan di peramban Anda; pertanyaan tidak dikirim ke server."],
  ["Putuskan menjawab atau diam", "Bila skor pasal teratas lebih rendah dari ambang yang dipilih dari data dev, sistem menolak menjawab dan hanya menunjukkan pasal terdekat. Skor BM25 mentah cenderung lebih tinggi untuk pertanyaan panjang, jadi gerbang ini tidak sempurna."],
  ["Mode kutipan langsung (bawaan)", "Kalimat jawaban dipilih dari ayat atau butir di pasal peringkat 1 dan disalin apa adanya. Tidak ada model bahasa yang menulis kalimat baru."],
  ["Mode generatif (pilihan)", `Bila Anda memilihnya, ${K_PASAL} pasal teratas diberikan ke model bahasa kecil yang berjalan di perangkat Anda. Model diminta menulis jawaban singkat dan menandai setiap kalimat dengan nomor pasal sumbernya, misalnya [1]. Bila tidak ada dasar, model diminta menjawab "TIDAK DITEMUKAN".`],
  ["Periksa sebelum ditampilkan", "Kalimat tanpa nomor pasal, nomor yang tidak ada, dan tautan ke luar dibuang. Bila tidak tersisa kalimat bersumber, situs kembali ke kutipan langsung dan memberi tahu Anda. Teks pasal diperlakukan sebagai data, bukan perintah, supaya isi dokumen tidak bisa mengubah perilaku model."],
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
    h("p", { class: "lead" }, "Situs ini mencari bukti di peraturan K3 lalu menjawab dengan dua cara: mengutip pasal persis, atau, bila Anda memilih, meminta model bahasa di perangkat Anda menulis jawaban singkat yang setiap kalimatnya menunjuk ke pasal sumber. Ia bukan penasihat hukum."));

  const jenis = h("section", { "aria-labelledby": "m-jenis" },
    h("h2", { id: "m-jenis" }, "Apakah ini AI generatif?"),
    h("div", { class: "kotak-jujur" },
      h("p", {}, `Ada dua mode, dan label di atas setiap jawaban menyebut mode mana yang dipakai. Mode bawaan, "Kutipan langsung", tidak generatif: kalimatnya disalin dari peraturan. Mode "Generatif di perangkat Anda" benar-benar memakai model bahasa: ${namaModel(MODEL)} di GPU (WebGPU), atau ${namaModel(MODEL_CPU)} di CPU untuk perangkat tanpa GPU yang cocok. Model menulis kalimat baru, paling banyak ${MAX_TOKEN_BARU} token, dari ${K_PASAL} pasal teratas.`),
      h("p", {}, "Kalimat generatif bisa keliru walaupun bernomor sumber: model dapat salah membaca angka, menggabungkan dua pasal, atau menulis hal yang tidak didukung pasal yang dikutipnya. Karena itu setiap kalimat diberi tombol ke pasal sumbernya, dan halaman Evaluasi mengukur seberapa sering kalimat didukung pasal yang dikutip. Mode kutipan tidak mengarang kalimat, tetapi tetap bisa mengutip pasal yang salah."),
      h("p", {}, "Teks korpus adalah hasil ekstraksi PDF, dan beberapa dokumen berasal dari OCR sehingga dapat memuat salah baca (misalnya “keija” untuk “kerja”). Rujuk selalu ke PDF resmi sebelum mengutip.")));

  const alur = h("section", { "aria-labelledby": "m-alur" },
    h("h2", { id: "m-alur" }, "Alur dari dokumen sampai kutipan"),
    h("ol", { class: "langkah" }, LANGKAH.map(([judul, isi]) => h("li", {}, h("div", {}, h("h3", {}, judul), h("p", {}, isi))))));

  const hosting = h("section", { "aria-labelledby": "m-host" },
    h("h2", { id: "m-host" }, "Hosting dan inferensi"),
    h("p", {}, "Situs ini sepenuhnya statis di Cloudflare Pages. Indeks dan korpus diunduh sekali ke peramban, lalu pencarian dihitung di sana. Tidak ada server aplikasi, tidak ada basis data, dan tidak ada API berbayar. Karena tidak ada server yang harus \"bangun\", tidak ada jeda mulai dingin seperti pada layanan gratis yang tidur saat sepi."),
    h("p", {}, `Mode generatif juga berjalan di perangkat Anda. Setelah Anda menekan tombol muat, peramban mengunduh pustaka transformers.js versi ${PUSTAKA.versi} dari jsDelivr dan bobot model dari Hugging Face, pada versi yang dipatok. Kode pustaka diperiksa sidik SHA-256-nya sebelum dijalankan. Unduhan ini besar (sekitar ${(UKURAN_UNDUHAN_MB.webgpu / 1000).toFixed(1).replace(".", ",")} GB untuk GPU atau ${UKURAN_UNDUHAN_MB.wasm} MB untuk CPU) dan disimpan di peramban untuk kunjungan berikutnya. Pertanyaan Anda tidak dikirim ke server mana pun; yang diunduh hanya berkas model.`),
    h("p", {}, "Pencarian di situs tetap BM25 dengan konteks. Model embedding dan reranker diuji secara offline di halaman Evaluasi, tetapi belum dipasang di situs karena embedding pertanyaan di peramban harus memakai bobot yang sama dengan evaluasi dan diuji kesamaannya lebih dulu."));

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
    h("div", { class: "peringatan" }, h("p", {}, "Rujukan pasal itu diambil dari sumber sekunder. Teks resmi di peraturan.bpk.go.id belum dapat dibuka dari lingkungan pengembangan, jadi nomor pasalnya perlu dicek manual oleh pemilik proyek sebelum dijadikan pegangan. Halaman ini bukan nasihat hukum.")),
    h("p", {}, "Kode program situs berlisensi MIT. Kutipan peraturan tetap milik publik dan tetap harus dirujuk ke sumber resminya."),
    h("p", {}, `Model generatif ${namaModel(MODEL)} dan ${namaModel(MODEL_CPU)} (Qwen, versi ONNX dari onnx-community) serta pustaka transformers.js berlisensi Apache-2.0. Penilai groundedness di halaman Evaluasi, mDeBERTa-v3-base-xnli-multilingual-nli-2mil7, berlisensi MIT dan hanya dipakai saat evaluasi, tidak di situs.`));

  const batas = h("section", { "aria-labelledby": "m-batas" },
    h("h2", { id: "m-batas" }, "Batas yang perlu Anda ketahui"),
    h("ul", { class: "daftar-teks" },
      h("li", {}, `Cakupannya ${korpus.dokumen.length} peraturan K3, bukan seluruh hukum Indonesia. Pertanyaan di luar itu seharusnya ditolak.`),
      h("li", {}, "Peraturan bisa berubah. Periksa selalu versi terbaru di sumber resmi sebelum mengambil keputusan."),
      h("li", {}, "Pada mode kutipan, pertanyaan yang jawabannya tersebar di beberapa pasal hanya dijawab sebagian karena kutipan diambil dari satu pasal. Mode generatif membaca empat pasal, tetapi bisa salah menggabungkannya."),
      h("li", {}, "Model generatif yang muat di peramban berukuran kecil. Ia lebih lemah daripada model besar di server, dan model CPU lebih lemah lagi. Periksa setiap kalimat terhadap pasal sumbernya."),
      h("li", {}, "Pertanyaan evaluasi ditulis oleh asisten AI pengembang, bukan pengguna atau praktisi K3, dan data uji sudah pernah dilihat. Angka di halaman Evaluasi adalah perkiraan optimistis, bukan ukuran kepuasan pengguna."),
      h("li", {}, "Gerbang penolakan lebih mudah menolak pertanyaan pendek dan masih dapat menjawab pertanyaan panjang berkosakata K3 yang tidak ada di korpus dengan pasal yang tidak relevan."),
      h("li", {}, "Jawaban untuk keputusan hukum, sanksi, atau audit sebaiknya dikonfirmasi ke ahli K3 atau konsultan hukum.")));

  const jejak = h("section", { "aria-labelledby": "m-jejak" },
    h("h2", { id: "m-jejak" }, "Kode dan data"),
    h("p", {}, `Pembagian pertanyaan dev dan test dibekukan (${evaluasi.pertanyaan.dev} dan ${evaluasi.pertanyaan.test}). Berkas hasil, korpus, dan seluruh langkah untuk mengulang perhitungan ada di repositori GitHub proyek ini; petunjuknya ada di bagian akhir halaman Evaluasi.`));

  clear(main).append(h("div", { class: "halaman halaman-lebar" }, intro, jenis, alur, hosting, dokumen, lisensi, batas, jejak));
  main.dataset.ready = "metode";
}
