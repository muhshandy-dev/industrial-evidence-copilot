"""Format korpus: dokumen, chunk per pasal, dan teks yang diindeks."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class Doc:
    id: str
    jenis: str  # UU | PP | Permenaker | ...
    nomor: str
    tahun: int
    tentang: str
    url: str
    sha256: str
    lisensi: str

    @property
    def judul(self) -> str:
        return f"{self.jenis} Nomor {self.nomor} Tahun {self.tahun}"


@dataclass(frozen=True)
class Chunk:
    id: str
    dok: int  # indeks ke daftar dokumen
    label: str
    bab: str
    judul_bab: str
    teks: str  # isi pasal apa adanya; dasar kutipan dan jawaban


@dataclass
class Corpus:
    asal: str  # "nyata" atau "fixture"
    docs: list[Doc]
    chunks: list[Chunk]

    def index_text(self, i: int, *, context: bool = True) -> str:
        """Teks untuk pencarian. Dengan context=True, judul dokumen dan bab ikut diindeks
        (chunk kontekstual); kutipan tetap memakai Chunk.teks asli."""
        c = self.chunks[i]
        if not context:
            return c.teks
        d = self.docs[c.dok]
        return f"{d.judul} tentang {d.tentang}. {c.judul_bab}. {c.teks}"

    def to_json(self) -> dict:
        return {
            "versi": 1,
            "asal": self.asal,
            "dokumen": [{**asdict(d), "judul": d.judul} for d in self.docs],
            "chunk": [asdict(c) for c in self.chunks],
        }

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(self.to_json(), ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )

    @classmethod
    def read(cls, path: Path) -> Corpus:
        raw = json.loads(path.read_text(encoding="utf-8"))
        docs = [Doc(**{k: v for k, v in d.items() if k != "judul"}) for d in raw["dokumen"]]
        return cls(raw["asal"], docs, [Chunk(**c) for c in raw["chunk"]])
