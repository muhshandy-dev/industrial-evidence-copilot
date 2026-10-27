// Status proyek dan domain produksi, dipakai situs dan Pages Function.
//
// Holdout v2 (27 Oktober 2026) gagal pada satu kriteria lolos (docs/holdout-v2-hasil.md), jadi
// proyek ditutup sebagai prototipe riset: di domain produksi hanya kutipan langsung yang aktif.
// Mode generatif tetap ada di kode dan di deploy Preview sebagai prototipe riset.
export const HOST_PRODUKSI = "industrial-evidence-copilot.pages.dev";
export const STATUS_PROYEK = "RAG Research Prototype";
export const generatifDiizinkan = (host) => host !== HOST_PRODUKSI;
