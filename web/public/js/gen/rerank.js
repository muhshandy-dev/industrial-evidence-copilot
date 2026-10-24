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
  return { tokenizer, model };
}

// Skor logit untuk setiap (pertanyaan, teks), urutan sama dengan masukan.
export async function skorPasangan(rr, tanya, teks) {
  const out = [];
  for (let i = 0; i < teks.length; i += BATCH) {
    const bagian = teks.slice(i, i + BATCH);
    const masuk = rr.tokenizer(bagian.map(() => tanya), { text_pair: bagian, padding: true, truncation: true, max_length: MAX_TOKEN });
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
