"""Perbandingan alur v1 dan alur v2 mode generatif pada satu set, dengan penilaian v1 dan v2.

Alur v2 (docs/alur-v2.md): gerbang BM25 atau reranker, ringkasan ayat untuk pasal panjang, dan
kutipan cadangan berurutan reranker. Keluaran v1 ada di eval/cache/gen/bertahan-llama-3.3-70b,
keluaran v2 di eval/cache/gen/v2-bertahan-llama-3.3-70b (prompt identik disalin dari v1).

Modul ini tidak memanggil model. Jalankan: `evidence eval-v2 --set dev`.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from . import generation as G
from .answer import extract_answer
from .evalset import key_hit, relevant
from .penilaian import key_hit_v2, nilai_tak_terjawab

KOMPONEN = ("gerbang", "ringkasan_ayat", "kutipan_cadangan")


def _konf(alur: str) -> str:
    varian = G.SERVER_SITUS[1]
    model = next(k for k, v in G.MODEL_SERVER.items() if v == G.SERVER_SITUS[0])
    return G.konfigurasi(varian, model, alur)


def kutipan(corpus, system, row: dict, lolos: bool) -> dict:
    """Kutipan langsung dari pasal peringkat 1 urutan `system`; lolos = keputusan gerbang."""
    ids = [c.id for c in corpus.chunks]
    match = [corpus.match_text(i) for i in range(len(ids))]
    ranked = system.search(row["tanya"], 10)
    ans = extract_answer(
        row["tanya"], ranked, match, system.retriever.bm25.idf,
        top_score=1.0 if lolos else 0.0, threshold=0.5,
        display_texts=[c.teks for c in corpus.chunks],
    )  # fmt: skip
    gold = relevant(row)
    cited = [ids[e.chunk_idx] for e in ans.evidence]
    teks = " ".join(e.match for e in ans.evidence)
    sah = bool(cited) and cited[0] in gold
    return {
        "menolak": ans.abstain,
        "sitasi": cited,
        "benar": bool(gold) and not ans.abstain and sah and key_hit(row["kunci"], teks),
        "benar_v2": bool(gold) and not ans.abstain and sah and key_hit_v2(row["kunci"], teks),
    }


def rekam(root: Path, corpus, systems: dict, metode: str, thr: float, s: str, alur: str) -> dict:
    """Rekaman per pertanyaan untuk satu alur, plus kutipan langsung bawaan situs."""
    gen_sys, bm = systems[G.SISTEM_GENERATIF], systems[metode]
    ids = [c.id for c in corpus.chunks]
    rows = G.load_set(root, s)
    gates = {g["id"]: g for g in G.gen_input(corpus, gen_sys, rows, s, thr, alur)}
    keluaran = {r["id"]: r for r in G.read_outputs(root, _konf(alur), (s,))}
    nli = G.NliCache(root)
    out, belum = [], []
    for row in rows:
        gate = gates[row["id"]]
        if gate["lolos_gerbang"]:
            g = keluaran.get(row["id"])
            if g is None or not G._fresh(g, gate, ids) or (g.get("alur") or "v1") != alur:
                belum.append(row["id"])
                continue
        else:
            g = G._tanpa_keluaran(row["id"], s)
        cadangan = (
            kutipan(corpus, gen_sys, row, gate["lolos_gerbang"])
            if alur == "v2"
            else kutipan(corpus, bm, row, gate["skor_gerbang"] >= thr)
        )
        j = G.judge(g, row, gate, cadangan, nli)
        tampil = g["periksa"]["kalimat"] if j["mode"] == "generatif" else []
        teks = " ".join(k["teks"] for k in tampil)
        rec = {
            "id": row["id"],
            "terjawab": bool(relevant(row)),
            "mode": j["mode"],
            "menolak": j["menolak"],
            "sitasi": j["sitasi"],
            "salinan_v1": bool(g.get("salinan")),
            "didukung": j["didukung"],
            "kalimat_tanpa_sitasi_tampil": sum(1 for k in tampil if not k["sitasi"]),
            "kutipan_bawaan": kutipan(corpus, bm, row, gate["skor_gerbang"] >= thr),
        }
        if rec["terjawab"]:
            rec["benar"] = bool(j["benar"])
            rec["sitasi_semua_sah"] = j.get("sitasi_semua_sah")
            if j["mode"] == "generatif":
                rec["benar_v2"] = bool(j["sitasi_ada_yang_sah"]) and key_hit_v2(row["kunci"], teks)
            elif j["mode"] == "cadangan_ekstraktif":
                rec["benar_v2"] = cadangan["benar_v2"]
            else:
                rec["benar_v2"] = False
        else:
            rec["tak_terjawab_v2"] = nilai_tak_terjawab(
                row, j["menolak"], j["mode"], j["sitasi"], teks
            )
        out.append(rec)
    return {"rekaman": out, "belum_dibangkitkan": belum}


def ringkas(recs: list[dict]) -> dict:
    a = [r for r in recs if r["terjawab"]]
    u = [r for r in recs if not r["terjawab"]]
    gen_a = [r for r in a if r["mode"] == "generatif"]
    kal = [x for r in recs if r["mode"] == "generatif" for x in r["didukung"] if x is not None]
    return {
        "n": len(recs),
        "mode": dict(Counter(r["mode"] for r in recs)),
        "benar_v1": G._rate([r["benar"] for r in a]),
        "benar_v2": G._rate([r["benar_v2"] for r in a]),
        "kutipan_bawaan_benar_v1": G._rate([r["kutipan_bawaan"]["benar"] for r in a]),
        "kutipan_bawaan_benar_v2": G._rate([r["kutipan_bawaan"]["benar_v2"] for r in a]),
        "tak_terjawab_keliru_v2": G._rate([r["tak_terjawab_v2"] == "keliru" for r in u]),
        "tak_terjawab_dijawab_v1": G._rate([not r["menolak"] for r in u]),
        "sitasi_semua_sah": G._rate([bool(r["sitasi_semua_sah"]) for r in gen_a]),
        "kalimat_didukung": G._rate(kal),
        "kalimat_tanpa_sitasi_tampil": sum(r["kalimat_tanpa_sitasi_tampil"] for r in recs),
    }


def komponen(v1: dict[str, dict], v2: dict[str, dict]) -> dict[str, str]:
    """Komponen alur v2 yang mengubah perlakuan tiap pertanyaan (None bila sama dengan v1)."""
    out = {}
    for qid, b in v2.items():
        a = v1[qid]
        if a["mode"] == "tolak_gerbang" and b["mode"] != "tolak_gerbang":
            out[qid] = "gerbang"
        elif b["mode"] != "tolak_gerbang" and not b["salinan_v1"]:
            out[qid] = "ringkasan_ayat"
        elif b["mode"] == "cadangan_ekstraktif":
            out[qid] = "kutipan_cadangan"
    return out


def bandingkan(hasil_v1: dict, hasil_v2: dict) -> dict:
    v1 = {r["id"]: r for r in hasil_v1["rekaman"]}
    v2 = {r["id"]: r for r in hasil_v2["rekaman"]}
    kom = komponen(v1, v2)
    per = {}
    for k in KOMPONEN:
        qs = [q for q, x in kom.items() if x == k]
        ans = [q for q in qs if v1[q]["terjawab"]]
        una = [q for q in qs if not v1[q]["terjawab"]]
        kal = [x for q in qs if v2[q]["mode"] == "generatif" for x in v2[q]["didukung"]]
        kal = [x for x in kal if x is not None]
        per[k] = {
            "pertanyaan": qs,
            "terjawab_benar_v1": sum(v1[q]["benar_v2"] for q in ans),
            "terjawab_benar_v2": sum(v2[q]["benar_v2"] for q in ans),
            "terjawab": len(ans),
            "tak_terjawab_keliru_v1": sum(v1[q]["tak_terjawab_v2"] == "keliru" for q in una),
            "tak_terjawab_keliru_v2": sum(v2[q]["tak_terjawab_v2"] == "keliru" for q in una),
            "tak_terjawab": len(una),
            "kalimat_didukung": f"{sum(kal)}/{len(kal)}",
        }
        p = per[k]
        p["lolos_aturan"] = (
            p["terjawab_benar_v2"] >= p["terjawab_benar_v1"]
            and p["tak_terjawab_keliru_v2"] - p["tak_terjawab_keliru_v1"] <= 1
            and (len(kal) < 10 or sum(kal) / len(kal) >= 0.8)
        )
    berubah = [
        {
            "id": q,
            "komponen": kom.get(q),
            "v1": {k: v1[q].get(k) for k in ("mode", "benar_v2", "tak_terjawab_v2")},
            "v2": {k: v2[q].get(k) for k in ("mode", "benar_v2", "tak_terjawab_v2")},
        }
        for q in v2
        if (v1[q].get("benar_v2"), v1[q].get("tak_terjawab_v2"))
        != (v2[q].get("benar_v2"), v2[q].get("tak_terjawab_v2"))
    ]
    return {"komponen": per, "hasil_berubah": berubah}


def jalankan(root: Path, s: str) -> dict:
    import json

    from .corpus import Corpus
    from .evalrag import build_systems

    if s in ("sealed", "holdout-v2"):
        raise SystemExit("set tersegel dan holdout v2 tidak dievaluasi lewat perintah ini")
    corpus = Corpus.read(root / "corpus" / "korpus.json")
    locked = json.loads((root / "eval" / "results.json").read_text(encoding="utf-8"))
    thr, metode = locked["ambang"]["terpilih"], locked["metode_dikirim"]
    systems = build_systems(corpus, root)
    h1 = rekam(root, corpus, systems, metode, thr, s, "v1")
    h2 = rekam(root, corpus, systems, metode, thr, s, "v2")
    return {
        "set": s,
        "catatan": "Tanpa panggilan model. Penilaian v1 dan v2 (docs/penilaian-v2.md); aturan "
        "keputusan per komponen di docs/alur-v2.md.",
        "ambang_bm25": thr,
        "ambang_reranker": G.AMBANG_RERANKER,
        "v1": {**ringkas(h1["rekaman"]), "belum_dibangkitkan": h1["belum_dibangkitkan"]},
        "v2": {**ringkas(h2["rekaman"]), "belum_dibangkitkan": h2["belum_dibangkitkan"]},
        **(bandingkan(h1, h2) if not h2["belum_dibangkitkan"] else {}),
    }
