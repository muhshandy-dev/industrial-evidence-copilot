"""Ekstraksi teks PDF dan pembersihan, lalu penguraian struktur peraturan (BAB, Pasal, ayat)."""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

_ROMAN = r"[IVXLCDM]+"
_RE_BAB = re.compile(rf"^BAB\s+({_ROMAN})\s*$")
_RE_PASAL = re.compile(r"^Pasal\s+(\d+\s?[A-Z]?)\s*$")
_RE_PENJELASAN = re.compile(r"^PENJELASAN(\s+ATAS)?\s*$")
_RE_AYAT = re.compile(r"^\((\d+[a-z]?)\)\s+")
_RE_PAGE_NUM = re.compile(r"^[-– ]*\d{1,3}[-– ]*$")
_RE_HEADING_TAIL = re.compile(r"^[A-Z][A-Z0-9 ,.\-/()']{2,}$")


def extract_pages(pdf_path: Path) -> list[str]:
    """Teks per halaman. pdfplumber dulu; pypdf bila hasilnya kosong."""
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        for p in pdf.pages:
            pages.append(p.extract_text() or "")
    if sum(len(p.strip()) for p in pages) >= 200:
        return pages
    from pypdf import PdfReader

    return [(p.extract_text() or "") for p in PdfReader(str(pdf_path)).pages]


def clean_pages(pages: list[str], *, extra_noise: tuple[str, ...] = ()) -> str:
    """Gabungkan halaman menjadi satu teks bersih.

    Dibuang: nomor halaman, baris kepala/kaki yang berulang di lebih dari sepertiga halaman,
    dan teks watermark yang disebut eksplisit di extra_noise. Kata putus di ujung baris
    digabung kembali. Tidak ada teks yang diubah isinya selain itu.
    """
    norm = [unicodedata.normalize("NFKC", p) for p in pages]
    line_pages: Counter[str] = Counter()
    for p in norm:
        for line in {ln.strip() for ln in p.splitlines() if ln.strip()}:
            line_pages[line] += 1
    repeated = {ln for ln, c in line_pages.items() if len(norm) >= 6 and c > len(norm) / 3}
    out: list[str] = []
    for p in norm:
        for raw in p.splitlines():
            line = raw.strip()
            if not line or line in repeated or _RE_PAGE_NUM.match(line):
                continue
            if any(n and n in line for n in extra_noise):
                continue
            out.append(line)
    text = "\n".join(out)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    return text


@dataclass
class Unit:
    """Satu pasal (atau bagian tanpa pasal) dengan konteks BAB."""

    doc_id: str
    kind: str  # "pasal" | "penjelasan" | "lampiran" | "pembuka"
    label: str  # mis. "Pasal 5"
    bab: str = ""
    heading: str = ""
    lines: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()

    @property
    def uid(self) -> str:
        slug = re.sub(r"\s+", "", self.label.lower())
        return (
            f"{self.doc_id}#{self.kind}-{slug}" if self.kind != "pasal" else f"{self.doc_id}#{slug}"
        )


def parse_units(text: str, doc_id: str) -> list[Unit]:
    """Pecah teks peraturan menjadi unit per pasal.

    Bagian setelah baris "PENJELASAN" ditandai kind="penjelasan" supaya dapat disaring.
    Teks sebelum Pasal pertama (menimbang, mengingat) menjadi unit "pembuka".
    """
    units: list[Unit] = []
    bab = ""
    heading = ""
    cur = Unit(doc_id, "pembuka", "Pembuka")
    mode = "pasal"
    expect_heading = False
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if _RE_PENJELASAN.match(line) and mode == "pasal" and units:
            units.append(cur)
            mode = "penjelasan"
            cur = Unit(doc_id, "penjelasan", "Penjelasan Umum", bab="", heading="")
            continue
        m = _RE_BAB.match(line)
        if m and mode == "pasal":
            bab = f"BAB {m.group(1)}"
            heading = ""
            expect_heading = True
            continue
        if expect_heading:
            if _RE_HEADING_TAIL.match(line) and not _RE_PASAL.match(line):
                heading = f"{heading} {line}".strip()
                continue
            expect_heading = False
        m = _RE_PASAL.match(line)
        if m:
            units.append(cur)
            label = "Pasal " + re.sub(r"\s+", "", m.group(1))
            if mode == "penjelasan":
                cur = Unit(doc_id, "penjelasan", f"Penjelasan {label}", bab, heading)
            else:
                cur = Unit(doc_id, "pasal", label, bab, heading)
            continue
        cur.lines.append(line)
        _ = i
    units.append(cur)
    return [u for u in units if u.text]


def split_ayat(text: str) -> list[str]:
    """Pecah teks pasal menjadi ayat. Teks tanpa ayat dikembalikan utuh."""
    parts: list[list[str]] = []
    for line in text.splitlines():
        if _RE_AYAT.match(line) or not parts:
            parts.append([line])
        else:
            parts[-1].append(line)
    return [" ".join(p).strip() for p in parts if p]
