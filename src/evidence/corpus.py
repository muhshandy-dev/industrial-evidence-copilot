"""Format korpus: dokumen, chunk per pasal, dan teks yang diindeks."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .text import modernize_spelling


@dataclass(frozen=True)
class Doc:
    id: str
    jenis: str  # UU | PP | Permenaker | Kepmenaker
    nomor: str
    tahun: int
    tentang: str
    judul_resmi: str
    url: str  # halaman dokumen di JDIH
    url_pdf: str
    sha256: str
    status_jdih: str
    tanggal_akses: str
    ocr: bool = False
    ejaan_lama: bool = False

    @property
    def judul(self) -> str:
        return f"{self.jenis} No. {self.nomor} Tahun {self.tahun}"


@dataclass(frozen=True)
class Chunk:
    id: str
    dok: int  # indeks ke daftar dokumen
    label: str
    bab: str
    judul_bab: str
    teks: str  # isi pasal apa adanya; dasar kutipan dan jawaban
    teks_cari: str = ""  # hanya bila berbeda dari teks (ejaan lama dimodernkan untuk pencocokan)
    catatan: str = ""


@dataclass
class Corpus:
    asal: str  # "nyata" atau "fixture"
    docs: list[Doc]
    chunks: list[Chunk]
    meta: dict = field(default_factory=dict)

    def match_text(self, i: int) -> str:
        c = self.chunks[i]
        return c.teks_cari or c.teks

    def index_text(self, i: int, *, context: bool = True) -> str:
        """Teks untuk pencarian. Dengan context=True, judul dokumen, subjek, dan bab ikut diindeks
        (chunk kontekstual); kutipan tetap memakai Chunk.teks asli."""
        body = self.match_text(i)
        if not context:
            return body
        c = self.chunks[i]
        d = self.docs[c.dok]
        return f"{d.judul} tentang {d.tentang}. {c.judul_bab}. {body}"

    def to_json(self) -> dict:
        return {
            "versi": 1,
            "asal": self.asal,
            **self.meta,
            "dokumen": [{**asdict(d), "judul": d.judul} for d in self.docs],
            "chunk": [{k: v for k, v in asdict(c).items() if v != ""} for c in self.chunks],
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
        chunks = [
            Chunk(**{"bab": "", "judul_bab": "", "teks_cari": "", "catatan": "", **c})
            for c in raw["chunk"]
        ]
        meta = {k: v for k, v in raw.items() if k not in ("versi", "asal", "dokumen", "chunk")}
        return cls(raw["asal"], docs, chunks, meta)


def build_corpus(manifest: dict, raw_dir: Path, text_dir: Path | None = None) -> Corpus:
    """Bangun korpus dari PDF di raw_dir. Memeriksa SHA-256 berkas terhadap manifest."""
    import hashlib

    from .ingest import clean_pages, extract_pages, parse_units

    docs: list[Doc] = []
    chunks: list[Chunk] = []
    warnings: list[str] = []
    for entry in manifest["dokumen"]:
        pdf = raw_dir / f"{entry['id']}.pdf"
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        if digest != entry["sha256"]:
            raise ValueError(f"{pdf.name}: SHA-256 {digest} tidak sama dengan manifest")
        text = clean_pages(extract_pages(pdf))
        if text_dir:
            text_dir.mkdir(parents=True, exist_ok=True)
            (text_dir / f"{entry['id']}.txt").write_text(text, encoding="utf-8")
        doc = Doc(
            id=entry["id"],
            jenis=entry["jenis"],
            nomor=str(entry["nomor"]),
            tahun=int(entry["tahun"]),
            tentang=entry["tentang"], judul_resmi=entry["judul_resmi"], url=entry["url_halaman"],
            url_pdf=entry["url_pdf"], sha256=entry["sha256"], status_jdih=entry["status_jdih"],
            tanggal_akses=entry["tanggal_akses"], ocr=bool(entry.get("ocr")),
            ejaan_lama=bool(entry.get("ejaan_lama")),
        )  # fmt: skip
        di = len(docs)
        docs.append(doc)
        for u in parse_units(text, doc.id, warnings):
            body = u.text
            chunks.append(Chunk(
                id=u.uid, dok=di, label=u.label, bab=u.bab, judul_bab=u.heading, teks=body,
                teks_cari=modernize_spelling(body) if doc.ejaan_lama else "", catatan=u.catatan,
            ))  # fmt: skip
    meta = {
        "peringatan_ekstraksi": warnings,
        "dibuat_dari": manifest["sumber"],
        "dasar_lisensi": manifest["dasar_lisensi"],
    }
    return Corpus("nyata", docs, chunks, meta)
