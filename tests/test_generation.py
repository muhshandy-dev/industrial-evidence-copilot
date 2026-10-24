import re
from pathlib import Path

from evidence import generation as G

ROOT = Path(__file__).resolve().parents[1]


def test_dtype_utama_sama_dengan_situs():
    js = (ROOT / "web/public/js/gen/prompt.js").read_text(encoding="utf-8")
    assert re.search(r'dtype: "([^"]+)"', js).group(1) == G.DTYPE_UTAMA
    assert G.konfigurasi("bertahan", "q4f16") == "bertahan"
    assert G.konfigurasi("bertahan", "q4") == "bertahan-q4"


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
