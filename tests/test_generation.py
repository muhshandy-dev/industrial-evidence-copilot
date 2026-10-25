import re
from pathlib import Path

from evidence import generation as G

ROOT = Path(__file__).resolve().parents[1]


def test_dtype_utama_sama_dengan_situs():
    js = (ROOT / "web/public/js/gen/prompt.js").read_text(encoding="utf-8")
    ids = re.findall(r'id: "([^"]+)"', js)
    assert ids[:2] == [G.MODEL_UTAMA, G.MODEL_CPU]
    assert re.findall(r'dtype: "([^"]+)"', js)[:2] == [G.DTYPE_UTAMA, G.DTYPE_CPU]
    assert G.konfigurasi("bertahan", G.MODEL_UTAMA) == "bertahan"
    assert G.konfigurasi("bertahan", G.MODEL_CPU) == "bertahan-cpu"
    for repo, kunci in G.MODEL_KANDIDAT.items():
        assert f'"{kunci}": {{\n    id: "{repo}"' in js
        assert G.konfigurasi("k3", repo) == f"k3-{kunci}"
    for model, kunci in G.MODEL_SERVER.items():
        assert f'"{kunci}": {{ id: "{model}"' in js
        assert G.konfigurasi("bertahan", model) == f"bertahan-{kunci}"
    assert set(G.URUTAN_SERVER) == set(G.MODEL_SERVER.values())
    # Pilihan mode server sama di Python dan situs.
    m = re.search(r"export const MODEL_SERVER = (null|MODEL_SERVER_KANDIDAT\[\"([^\"]+)\"\]);", js)
    v = re.search(r'export const VARIAN_SERVER = "([^"]+)";', js)
    assert m and v
    if G.SERVER_SITUS is None:
        assert m.group(1) == "null"
    else:
        assert (m.group(2), v.group(1)) == G.SERVER_SITUS


def test_jendela_nli_berurutan_dan_terbatas():
    teks = "\n".join(f"({i}) " + "kata " * 60 for i in range(1, 6))
    w = G.windows(teks)
    assert w[0].startswith("(1)")
    assert all(len(x) <= G.JENDELA_KARAKTER or "(" not in x[1:] for x in w)
    assert len(w) == len(set(w))


class _Nli:
    def __init__(self, s):
        self.s = s

    def support(self, kalimat, pasal_teks):
        return self.s


def _rec(status, kalimat, pasal=("a#1", "b#2")):
    return {
        "id": "q1",
        "set": "test",
        "pasal": list(pasal),
        "pasal_teks": ["x", "y"],
        "baca": {"kalimat": kalimat, "tanpaSitasi": 0, "sitasiTidakSah": 0},
        "periksa": {"status": status, "kalimat": kalimat},
        "detik": 1.0,
        "token_keluar": 5,
    }


def test_penilaian_jawaban_generatif():
    row = {"id": "q1", "gold": ["b#2"], "kunci": ["24 jam"]}
    k = [{"teks": "Laporan paling lambat 2 x 24 jam.", "sitasi": [2]}]
    rec = G.judge(_rec("jawab", k), row, {"lolos_gerbang": True}, None, _Nli(0.9))
    assert rec["mode"] == "generatif" and rec["benar"] and rec["didukung"] == [True]
    salah = G.judge(
        _rec("jawab", [{**k[0], "sitasi": [1]}]), row, {"lolos_gerbang": True}, None, _Nli(0.1)
    )
    assert not salah["benar"] and salah["didukung"] == [False]
    gerbang = G.judge(_rec("jawab", k), row, {"lolos_gerbang": False}, None, _Nli(0.9))
    assert gerbang["mode"] == "tolak_gerbang" and gerbang["menolak"] and not gerbang["benar"]
    cadangan = G.judge(
        _rec("tanpa_dasar", []),
        row,
        {"lolos_gerbang": True},
        {"menolak": False, "benar": True},
        _Nli(0.9),
    )
    assert cadangan["mode"] == "cadangan_ekstraktif" and cadangan["benar"]
    s = G.summarize([rec, salah, gerbang, cadangan])
    assert s["jawaban_benar"]["k"] == 2 and s["mode"]["generatif"] == 2


def test_keluaran_basi_tidak_dihitung():
    ids = ["a#1", "b#2", "c#3"]
    assert G._fresh({"pasal": ["b#2", "a#1"]}, {"peringkat": [1, 0, 2]}, ids)
    assert not G._fresh({"pasal": ["a#1", "b#2"]}, {"peringkat": [1, 0, 2]}, ids)
    assert not G._fresh(None, {"peringkat": [1]}, ids)


def test_reranker_situs_sama_dengan_evaluasi():
    import json
    import subprocess

    from evidence.corpus import Corpus
    from evidence.rerank import RERANKERS, TOP

    js = (ROOT / "web/public/js/gen/rerank.js").read_text(encoding="utf-8")
    repo, rev, layak = RERANKERS[G.SISTEM_GENERATIF.split("+")[1]]
    assert f'id: "{repo}"' in js and f'revision: "{rev}"' in js and layak
    assert f"RERANK_TOP = {TOP};" in js
    # Teks pasal yang dinilai reranker di peramban identik dengan Corpus.index_text.
    kode = (
        "import { readFileSync } from 'node:fs';"
        "import { teksPasal } from './web/public/js/gen/rerank.js';"
        "const k = JSON.parse(readFileSync('web/public/data/korpus.json'));"
        "console.log(JSON.stringify(k.chunk.map((_, i) => teksPasal(k, i))));"
    )
    out = subprocess.run(
        ["node", "--input-type=module", "-e", kode],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )  # fmt: skip
    corpus = Corpus.read(ROOT / "web/public/data/korpus.json")
    assert json.loads(out.stdout) == [corpus.index_text(i) for i in range(len(corpus.chunks))]


def _hasil(gb: int, tak: int = 0, didukung=(0, 0), belum: int = 0) -> dict:
    k, n = didukung
    return {
        "generatif_benar": gb,
        "belum_dibangkitkan": belum,
        "dijawab_padahal_tak_terjawab": {"k": tak},
        "kalimat_didukung": {"k": k, "n": n, "nilai": k / n if n else 0.0},
    }


def test_aturan_pilih_prompt():
    from evidence.generation import choose_prompt

    base = _hasil(0)
    # Terbaik di 1,5B menang bila memenuhi syarat.
    assert choose_prompt({"bertahan": base, "k1": _hasil(10), "k2": _hasil(20)}) == "k2"
    # Lebih banyak menjawab pertanyaan tak terjawab daripada bertahan: gugur.
    assert choose_prompt({"bertahan": base, "k1": _hasil(10), "k2": _hasil(20, tak=1)}) == "k1"
    # Dukungan NLI di bawah 80% (dengan 10 kalimat atau lebih): gugur.
    assert choose_prompt({"bertahan": base, "k1": _hasil(10, didukung=(7, 10))}) == "bertahan"
    # Seri (selisih <= 1): yang lebih baik di model CPU, lalu yang paling sederhana.
    h = {"bertahan": base, "k1": _hasil(10), "k3": _hasil(11), "k3-cpu": _hasil(5)}
    assert choose_prompt(h) == "k3"
    assert choose_prompt({"bertahan": base, "k1": _hasil(10), "k3": _hasil(11)}) == "k1"
    # Kandidat yang belum lengkap tidak dipilih.
    assert choose_prompt({"bertahan": base, "k1": _hasil(30, belum=2)}) == "bertahan"


def test_aturan_pilih_putaran_2():
    from evidence.generation import choose_config

    base = _hasil(0)
    h = {"bertahan": base, "k3": _hasil(20, didukung=(27, 41)), "k3-qwen3-4b": _hasil(25)}
    assert choose_config(h) == "k3-qwen3-4b"
    # Seri: unduhan lebih kecil menang.
    h = {"bertahan": base, "k1-qwen3-1.7b": _hasil(24), "k3-qwen3-4b": _hasil(25)}
    assert choose_config(h) == "k1-qwen3-1.7b"
    # Tidak ada yang lolos syarat selain pembanding yang tidak menjawab apa pun.
    h = {"bertahan": base, "k3-qwen3-4b": _hasil(25, tak=1)}
    assert choose_config(h) == "bertahan"


def test_aturan_pilih_putaran_3():
    from evidence.generation import choose_server

    base = _hasil(0)
    # Terbaik yang lolos syarat menang.
    h = {"bertahan": base, "bertahan-mistral-small-3.1": _hasil(30), "k3-llama-3.3-70b": _hasil(35)}
    assert choose_server(h) == "k3-llama-3.3-70b"
    # Seri (selisih <= 1): prompt bertahan lebih dulu, lalu model termurah.
    h = {"bertahan": base, "bertahan-llama-3.3-70b": _hasil(34), "k3-llama-4-scout": _hasil(35)}
    assert choose_server(h) == "bertahan-llama-3.3-70b"
    h = {"bertahan": base, "bertahan-llama-3.3-70b": _hasil(35)}
    h["bertahan-llama-4-scout"] = _hasil(34)
    assert choose_server(h) == "bertahan-llama-4-scout"
    # Gugur karena NLI, tak terjawab, atau belum lengkap; tanpa yang lolos hasilnya None.
    h = {
        "bertahan": base,
        "bertahan-llama-4-scout": _hasil(40, didukung=(15, 20)),
        "bertahan-mistral-small-3.1": _hasil(40, tak=1),
        "k3-mistral-small-3.1": _hasil(40, belum=3),
    }
    assert choose_server(h) is None
    # Model di peramban tidak ikut putaran ini.
    assert choose_server({"bertahan": base, "k3-qwen3-4b": _hasil(40)}) is None
