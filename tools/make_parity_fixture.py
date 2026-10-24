"""Buat tests/fixtures/parity.json: indeks mini dan keluaran acuan Python untuk uji paritas JS.

Jalankan ulang hanya bila rumus berubah: python tools/make_parity_fixture.py
"""

from __future__ import annotations

import json
from pathlib import Path

from evidence.answer import extract_answer
from evidence.export_web import build_index
from evidence.fusion import rank_order
from evidence.retriever import Retriever

THRESHOLD = 5.0  # nilai uji paritas saja, bukan ambang produksi
FIX = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


def main() -> None:
    src = json.loads((FIX / "mini_corpus.json").read_text(encoding="utf-8"))
    r = Retriever(src["chunks"], lsa_dim=5)
    expected = []
    for q in src["queries"]:
        row = {"query": q}
        for m in ("bm25",):
            s = r.scores(q, m)
            row[m] = {
                "order": [int(i) for i in rank_order(s)],
                "scores": [round(float(x), 6) for x in s],
            }
        top = row["bm25"]["order"][0]
        ans = extract_answer(
            q,
            row["bm25"]["order"],
            src["chunks"],
            r.bm25.idf,
            top_score=float(row["bm25"]["scores"][top]),
            threshold=THRESHOLD,
        )
        row["answer"] = {
            "abstain": ans.abstain,
            "score": round(ans.score, 6),
            "coverage": round(ans.coverage, 6),
            "evidence": [[e.chunk_idx, e.unit_idx, e.text] for e in ans.evidence],
        }
        expected.append(row)
    out = {
        "chunks": src["chunks"],
        "threshold": THRESHOLD,
        "index": build_index(r),
        "expected": expected,
    }
    (FIX / "parity.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("tulis", FIX / "parity.json")


if __name__ == "__main__":
    main()
