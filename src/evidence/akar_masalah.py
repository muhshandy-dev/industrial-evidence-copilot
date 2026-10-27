"""Analisis akar masalah mode generatif dan kutipan, tanpa inferensi model.

Membaca keluaran yang sudah di-commit (eval/cache/gen, eval/cache/nli, eval/cache/rerank) dan
menulis eval/analisis/akar-masalah.json:

- rekaman per pertanyaan untuk dev, test, dan tersegel (gerbang, peringkat pasal emas, empat pasal
  yang dikirim ke model, keluaran, sitasi, penilaian);
- pembagian kegagalan per tahap alur;
- penilaian ulang kunci fakta dengan aturan "setara angka" (pasca-hoc, lihat di bawah);
- eksperimen offline: kutipan langsung dengan urutan reranker dan gerbang skor reranker, dengan
  ambang yang dipilih di dev saja.

Set tersegel sudah dipakai sekali (eval/sealed/hasil.json). Angka tersegel di sini hanya diagnosis
dan tidak boleh disebut evaluasi independen. Jalankan: `python -m evidence.akar_masalah`.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import numpy as np

from . import generation as G
from .answer import extract_answer
from .corpus import Corpus
from .dense import text_key
from .evalrag import _balanced, answer_all, build_systems
from .evalset import key_hit, key_tokens, relevant

ROOT = Path(__file__).resolve().parents[2]
SETS = ("dev", "test", "sealed")
MAKS_KARAKTER_PASAL = 1800  # sama dengan web/public/js/gen/prompt.js

# Aturan "setara angka", ditulis setelah melihat kegagalan tersegel, jadi pasca-hoc. Diterapkan sama
# pada semua set dan semua mode. Jawaban dianggap memuat kunci bila cocok menurut aturan resmi ATAU
# menurut aturan ini: angka yang ditulis dengan ejaan dalam kurung ("3 (tiga) bulan") cukup ditulis
# angkanya, kata bilangan sebelum satuan waktu dianggap angka, "%" sama dengan "persen", dan
# "meter" sama dengan "m".
_ANGKA = {
    "dua belas": "12", "sebelas": "11", "sepuluh": "10", "sembilan": "9", "delapan": "8",
    "tujuh": "7", "enam": "6", "lima": "5", "empat": "4", "tiga": "3", "dua": "2", "satu": "1",
}  # fmt: skip
_SATUAN = r"(?=\s+(?:bulan|tahun|hari|jam|minggu|kali|orang|m|meter)\b)"


def _norm(t: str) -> str:
    t = t.lower()
    t = re.sub(r"(\d[\d.,]*)\s*\(\s*[a-z ]+\s*\)", r"\1", t)
    for w, d in _ANGKA.items():
        t = re.sub(rf"\b{w}\b{_SATUAN}", d, t)
    t = re.sub(r"(\d)\s*%", r"\1 persen", t)
    return re.sub(r"\bmeter\b", "m", t)


def key_hit_setara(kunci: list[str], text: str) -> bool:
    if key_hit(kunci, text):
        return True
    toks = key_tokens(_norm(text))
    return all(key_tokens(_norm(k)) <= toks for k in kunci)


def tahap(r: dict) -> str:
    """Tahap pertama yang gagal untuk pertanyaan terjawab, menurut alur situs."""
    gold = set(r["gold"]) | set(r["gold_alt"] or [])
    if r["benar"]:
        return "benar"
    if r["mode"] == "tolak_gerbang":
        return "gerbang menolak"
    if not set(r["top4"]) & gold:
        return "pencarian" if not r["rank_emas_gen"] else "pemilihan pasal"
    if r["mode"] == "tolak_model":
        return "model menolak padahal emas di konteks"
    if r["mode"] == "cadangan_ekstraktif":
        return "cadangan kutipan salah"
    if not r["sitasi_ada_yang_sah"]:
        return "sitasi ke pasal lain"
    return "kunci fakta tidak cocok"


def main() -> None:
    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    locked = json.loads((ROOT / "eval" / "results.json").read_text(encoding="utf-8"))
    thr = locked["ambang"]["terpilih"]
    systems = build_systems(corpus, ROOT)
    gen_sys, bm = systems[G.SISTEM_GENERATIF], systems[locked["metode_dikirim"]]
    ids = [c.id for c in corpus.chunks]
    idx = {c: i for i, c in enumerate(ids)}
    match = [corpus.match_text(i) for i in range(len(ids))]
    shown = [c.teks for c in corpus.chunks]
    idf = bm.retriever.bm25.idf
    rtab = gen_sys.rerank.table
    nli = G.NliCache(ROOT)
    konf = G.konfigurasi_server()
    rows = {s: G.load_set(ROOT, s) for s in SETS}

    def bmax(q: str) -> float:
        return float(bm.retriever.bm25.scores(bm.retriever.query_tokens(q)).max())

    # ---- rekaman per pertanyaan, mode generatif utama ----
    rekaman: dict[str, list[dict]] = {}
    for s in SETS:
        gates = {g["id"]: g for g in G.gen_input(corpus, gen_sys, rows[s], s, thr)}
        ext = {r["id"]: r for r in answer_all(corpus, bm, rows[s], thr)}
        by_id = {r["id"]: r for r in G.read_outputs(ROOT, konf, (s,))}
        out = []
        for r in rows[s]:
            gate = gates[r["id"]]
            if gate["lolos_gerbang"]:
                g = by_id[r["id"]]
                assert G._fresh(g, gate, ids), r["id"]
            else:
                g = G._tanpa_keluaran(r["id"], s)
            j = G.judge(g, r, gate, ext[r["id"]], nli)
            gold = relevant(r)
            rank_gen = [ids[i] for i in gen_sys.search(r["tanya"], 20)]
            rank_bm = [ids[i] for i in bm.search(r["tanya"], 20)]

            def first(rk: list[str], gold: set[str] = gold) -> int | None:
                return next((k for k, x in enumerate(rk, 1) if x in gold), None)

            tampil = [k["teks"] for k in g.get("periksa", {}).get("kalimat", [])]
            rec = {
                **{k: r.get(k) for k in ("id", "tanya", "gaya", "gold", "gold_alt", "kunci")},
                **{k: r.get(k) for k in ("jenis", "catatan")},
                "skor_gerbang": gate["skor_gerbang"],
                "lolos_gerbang": gate["lolos_gerbang"],
                "skor_reranker_top1": rtab.get(text_key(r["tanya"]), {}).get(rank_gen[0]),
                "rank_emas_gen": first(rank_gen),
                "rank_emas_bm25": first(rank_bm),
                "top4": g.get("pasal") if gate["lolos_gerbang"] else rank_gen[:4],
                "mentah": g.get("mentah"),
                "tampil": tampil,
                **{k: j.get(k) for k in ("mode", "menolak", "sitasi", "benar")},
                **{k: j.get(k) for k in ("sitasi_ada_yang_sah", "sitasi_semua_sah", "kunci_ada")},
                "ekstraktif": {
                    k: ext[r["id"]].get(k)
                    for k in ("menolak", "sitasi", "top1", "sitasi_benar", "kunci_ada", "benar")
                },
            }
            if gold:
                rec["tahap"] = tahap(rec)
                rec["benar_setara"] = (
                    bool(rec["sitasi_ada_yang_sah"])
                    and key_hit_setara(r["kunci"], " ".join(tampil))
                    if rec["mode"] == "generatif"
                    else bool(rec["benar"])
                )
                # Kunci hanya ada setelah batas potong prompt pada semua pasal emas.
                gi = [idx[x] for x in gold if x in idx]
                rec["kunci_terpotong"] = any(key_hit(r["kunci"], match[i]) for i in gi) and not any(
                    key_hit(r["kunci"], match[i][:MAKS_KARAKTER_PASAL]) for i in gi
                )
            out.append(rec)
        rekaman[s] = out

    def ringkas_set(s: str) -> dict:
        a = [r for r in rekaman[s] if r["gold"]]
        u = [r for r in rekaman[s] if not r["gold"]]
        di_konteks = ("pencarian", "pemilihan pasal", "gerbang menolak")
        ctx = [r for r in a if r["tahap"] not in di_konteks]
        para = [r for r in a if r["gaya"] == "parafrase"]
        b_ctx = [r["benar_setara"] for r in ctx]
        e = Counter()
        for r in a:
            x = r["ekstraktif"]
            if x["benar"]:
                e["benar"] += 1
            elif x["menolak"]:
                e["gerbang menolak"] += 1
            elif not x["sitasi_benar"]:
                e["pasal peringkat 1 salah"] += 1
            else:
                e["kalimat terpilih tanpa kunci"] += 1
        return {
            "terjawab": len(a),
            "tak_terjawab": len(u),
            "gaya_terjawab": dict(Counter(r["gaya"] for r in a)),
            "gaya_tak_terjawab": dict(Counter(r["gaya"] for r in u)),
            "jenis_terjawab": dict(Counter(r["jenis"] for r in a)),
            "kunci_per_pertanyaan": round(np.mean([len(r["kunci"]) for r in a]), 2),
            "pertanyaan_dengan_kunci_ejaan_kurung": sum(
                any(re.search(r"\d\s*\([a-z ]+\)", k) for k in r["kunci"]) for r in a
            ),
            "panjang_kata_median": float(np.median([len(r["tanya"].split()) for r in a])),
            "terjawab_lolos_gerbang": sum(r["lolos_gerbang"] for r in a),
            "parafrase_lolos_gerbang": f"{sum(r['lolos_gerbang'] for r in para)}/{len(para)}",
            "tak_terjawab_lolos_gerbang": sum(r["lolos_gerbang"] for r in u),
            "generatif_tahap_gagal": dict(Counter(r["tahap"] for r in a)),
            "generatif_benar_resmi": sum(bool(r["benar"]) for r in a),
            "generatif_benar_setara": sum(r["benar_setara"] for r in a),
            "generatif_benar_setara_bila_emas_di_konteks": f"{sum(b_ctx)}/{len(ctx)}",
            "generatif_tak_terjawab_dijawab": [r["id"] for r in u if not r["menolak"]],
            "kunci_terpotong": [r["id"] for r in a if r["kunci_terpotong"]],
            "ekstraktif_tahap_gagal": dict(e),
        }

    # ---- eksperimen kutipan langsung (tanpa inferensi) ----
    def ekstraktif(rs: list[dict], system, gate) -> list[dict]:
        out = []
        for r in rs:
            ranked = system.search(r["tanya"], 10)
            b = bmax(r["tanya"])
            t = rtab.get(text_key(r["tanya"]), {}).get(ids[ranked[0]], -99.0)
            lolos = gate(b, t)
            ans = extract_answer(
                r["tanya"], ranked, match, idf, top_score=1.0 if lolos else 0.0,
                threshold=0.5, display_texts=shown,
            )  # fmt: skip
            gold = relevant(r)
            cited = [ids[e.chunk_idx] for e in ans.evidence]
            rec = {"id": r["id"], "terjawab": bool(gold), "menolak": ans.abstain, "rtop": t}
            if gold:
                sah = bool(cited) and cited[0] in gold
                teks = " ".join(e.match for e in ans.evidence)
                rec["benar"] = (not ans.abstain) and sah and key_hit(r["kunci"], teks)
            out.append(rec)
        return out

    def skor(recs: list[dict]) -> dict:
        a = [r for r in recs if r["terjawab"]]
        u = [r for r in recs if not r["terjawab"]]
        return {
            "benar": f"{sum(r['benar'] for r in a)}/{len(a)}",
            "tak_terjawab_dijawab": f"{sum(not r['menolak'] for r in u)}/{len(u)}",
            "skor_seimbang": round(_balanced(recs), 4),
        }

    gerbang_bm = lambda b, t: b >= thr  # noqa: E731
    grid = [round(float(x), 2) for x in np.arange(-8, 8.01, 0.25)]
    # Ambang reranker dipilih di dev saja: skor seimbang tertinggi, ambang terkecil bila seri
    # (aturan yang sama dengan ambang BM25 di evalrag.calibrate_threshold).
    sapuan = []
    for t in grid:
        recs = ekstraktif(rows["dev"], gen_sys, lambda b, s, t=t: b >= thr or s >= t)
        sapuan.append((_balanced(recs), -t, t))
    t_rr = max(sapuan)[2]
    gerbang_gabung = lambda b, s: b >= thr or s >= t_rr  # noqa: E731
    varian = {
        "X0 kutipan BM25, gerbang BM25 (situs sekarang)": (bm, gerbang_bm),
        "X1 kutipan urutan reranker, gerbang BM25": (gen_sys, gerbang_bm),
        f"X2 kutipan urutan reranker, gerbang BM25 atau reranker >= {t_rr}": (
            gen_sys,
            gerbang_gabung,
        ),
    }
    eksperimen = {"ambang_reranker_dari_dev": t_rr, "varian": {}}
    for nama, (sysm, g) in varian.items():
        eksperimen["varian"][nama] = {s: skor(ekstraktif(rows[s], sysm, g)) for s in SETS}
    # Batas atas gerbang gabungan untuk mode generatif: pertanyaan terjawab yang sekarang ditolak
    # gerbang, akan lolos, dan pasal emasnya ada di empat teratas; serta pertanyaan tak terjawab
    # yang akan menambah panggilan model.
    batas = {}
    for s in SETS:
        rt = {x["id"]: x["rtop"] for x in ekstraktif(rows[s], gen_sys, lambda b, t: True)}
        a = [r for r in rekaman[s] if r["gold"] and r["mode"] == "tolak_gerbang"]
        u = [r for r in rekaman[s] if not r["gold"] and r["mode"] == "tolak_gerbang"]
        batas[s] = {
            "terjawab_baru_lolos_emas_di_konteks": sum(
                rt[r["id"]] >= t_rr and bool(r["rank_emas_gen"]) and r["rank_emas_gen"] <= 4
                for r in a
            ),
            "tak_terjawab_baru_ke_model": sum(rt[r["id"]] >= t_rr for r in u),
        }
    eksperimen["generatif_gerbang_gabungan_batas_atas"] = batas

    hasil = {
        "catatan": (
            "Tanpa inferensi. Set tersegel sudah dipakai sekali; angkanya di sini diagnosis, bukan "
            "evaluasi independen. Aturan kunci setara angka dan semua eksperimen dibuat setelah "
            "kegagalan tersegel terlihat."
        ),
        "ringkasan": {s: ringkas_set(s) for s in SETS},
        "eksperimen": eksperimen,
        "rekaman": rekaman,
    }
    out = ROOT / "eval" / "analisis" / "akar-masalah.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(hasil, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(
        json.dumps({k: hasil[k] for k in ("ringkasan", "eksperimen")}, ensure_ascii=False, indent=1)
    )


if __name__ == "__main__":
    main()
