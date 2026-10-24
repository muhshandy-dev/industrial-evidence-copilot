// Reranker cross-encoder untuk mode generatif: menilai ulang 20 pasal teratas BM25, lalu empat
// pasal terbaik diberikan ke model generatif. Bobot ONNX fp32 dari repositori model yang sama
// dengan evaluasi (PyTorch fp32); kesamaan skornya diuji di web/scripts/paritas-rerank.mjs.
// Modul ini tidak bergantung pada peramban, supaya dapat dipakai uji paritas di Node.

export const RERANKER = {
  id: "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1",
  revision: "1427fd652930e4ba29e8149678df786c240d8825",
  dtype: "fp32",
  lisensi: "Apache-2.0",
};
export const RERANK_TOP = 20; // sama dengan TOP di src/evidence/rerank.py
const MAX_TOKEN = 512; // sama dengan max_length CrossEncoder di evaluasi
const BATCH = 4;

// Teks pasal yang dinilai, identik dengan Corpus.index_text di Python (diuji di
// tests/test_generation.py). Pasal tanpa judul bab memakai string kosong, seperti di sana.
export function teksPasal(korpus, ci) {
  const c = korpus.chunk[ci];
  const d = korpus.dokumen[c.dok];
  return `${d.judul} tentang ${d.tentang}. ${c.judul_bab ?? ""}. ${c.teks_cari || c.teks}`;
}

export async function muatReranker(lib, device, onProgress) {
  const opsi = { revision: RERANKER.revision, progress_callback: (p) => { if (p.status === "progress") onProgress?.(p); } };
  const [tokenizer, model] = await Promise.all([
    lib.AutoTokenizer.from_pretrained(RERANKER.id, opsi),
    lib.AutoModelForSequenceClassification.from_pretrained(RERANKER.id, { ...opsi, dtype: RERANKER.dtype, device }),
  ]);
  const rr = { lib, tokenizer, model };
  // Pasangan pendek tidak terpotong, jadi susunan manual harus sama persis dengan tokenizer.
  const contoh = ["uji pasangan", "teks pasal pendek."];
  const acuan = tokenizer(contoh[0], { text_pair: contoh[1] });
  const manual = susun(rr, ...contoh);
  if (Array.from(acuan.input_ids.data, Number).join() !== manual.ids.join()) {
    throw new Error("susunan token reranker tidak sama dengan tokenizer");
  }
  rr.kunci = Object.keys(acuan);
  return rr;
}

// Token pasangan dengan pemotongan "longest_first" seperti tokenizer Python yang dipakai evaluasi
// (sentence-transformers CrossEncoder). Pemotongan bawaan transformers.js memotong ujung urutan
// gabungan, termasuk token </s> penutup, sehingga skor pasal panjang berbeda dari evaluasi.
// Susunan XLM-R: <s> tanya </s></s> pasal </s> (4 token khusus).
function susun(rr, tanya, teks) {
  const t = rr.tokenizer;
  let a = t.encode(tanya, { add_special_tokens: false });
  let b = t.encode(teks, { add_special_tokens: false });
  const muat = MAX_TOKEN - 4;
  if (a.length + b.length > muat) {
    const separuh = Math.floor(muat / 2);
    if (a.length <= separuh) b = b.slice(0, muat - a.length);
    else if (b.length <= separuh) a = a.slice(0, muat - b.length);
    else { a = a.slice(0, separuh); b = b.slice(0, muat - separuh); }
  }
  return { ids: [t.bos_token_id, ...a, t.sep_token_id, t.sep_token_id, ...b, t.sep_token_id] };
}

function tensor(rr, baris) {
  const panjang = baris[0].length;
  return new rr.lib.Tensor("int64", BigInt64Array.from(baris.flat(), BigInt), [baris.length, panjang]);
}

// Skor logit untuk setiap (pertanyaan, teks), urutan sama dengan masukan.
export async function skorPasangan(rr, tanya, teks) {
  const out = [];
  const pad = rr.tokenizer.pad_token_id;
  for (let i = 0; i < teks.length; i += BATCH) {
    const ids = teks.slice(i, i + BATCH).map((x) => susun(rr, tanya, x).ids);
    const L = Math.max(...ids.map((x) => x.length));
    const masuk = {
      input_ids: tensor(rr, ids.map((x) => [...x, ...Array(L - x.length).fill(pad)])),
      attention_mask: tensor(rr, ids.map((x) => [...x.map(() => 1), ...Array(L - x.length).fill(0)])),
    };
    if (rr.kunci.includes("token_type_ids")) masuk.token_type_ids = tensor(rr, ids.map(() => Array(L).fill(0)));
    const { logits } = await rr.model(masuk);
    out.push(...Array.from(logits.data, Number));
  }
  return out;
}

// Urutkan ulang RERANK_TOP teratas menurut skor reranker (seri: urutan asal), sisanya tetap.
export async function urutUlang(rr, korpus, tanya, ranked) {
  const atas = ranked.slice(0, RERANK_TOP);
  const skor = await skorPasangan(rr, tanya, atas.map((ci) => teksPasal(korpus, ci)));
  const urut = atas.map((ci, i) => ({ ci, i, s: skor[i] })).sort((a, b) => b.s - a.s || a.i - b.i);
  return { peringkat: [...urut.map((x) => x.ci), ...ranked.slice(RERANK_TOP)], skor: urut };
}
