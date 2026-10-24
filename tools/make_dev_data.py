"""Data pengembangan untuk website dari korpus TIRUAN. Tidak boleh di-deploy.

Menulis web/public/data/{korpus,indeks}.json dengan asal="fixture"; web/scripts/check-build.mjs
menolak build produksi bila asal bukan "nyata".
"""

from __future__ import annotations

import json
from pathlib import Path

from evidence.corpus import Chunk, Corpus, Doc
from evidence.export_web import write_index
from evidence.retriever import Retriever

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    src = json.loads((ROOT / "tests" / "fixtures" / "mini_corpus.json").read_text(encoding="utf-8"))
    doc = Doc(
        "fixture-a", "Fixture", "0", 2000, "Korpus Tiruan Pengembangan", "", "0" * 64, "tiruan"
    )
    chunks = []
    for i, text in enumerate(src["chunks"]):
        head, _, body = text.partition("\n")
        chunks.append(Chunk(f"fixture-a#pasal-{i + 1}", 0, head, "BAB I", "KETENTUAN TIRUAN", body))
    corpus = Corpus("fixture", [doc], chunks)
    data = ROOT / "web" / "public" / "data"
    corpus.write(data / "korpus.json")
    r = Retriever([corpus.index_text(i) for i in range(len(chunks))], lsa_dim=5)
    write_index(r, data / "indeks.json")
    print("data pengembangan (TIRUAN) ditulis ke", data)


if __name__ == "__main__":
    main()
