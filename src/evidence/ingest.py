"""Ekstraksi teks PDF, pembersihan, dan penguraian struktur peraturan (BAB, Pasal, ayat).

Hanya batang tubuh (Pasal) yang menjadi korpus. Menimbang/mengingat (pembuka), penutup,
Penjelasan, dan Lampiran sengaja tidak dimuat: pembuka dan penutup bukan norma, sedangkan
Penjelasan dan Lampiran (tabel, formulir, gambar) tidak dapat diekstrak dengan andal dari PDF.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

_RE_BAB = re.compile(r"^BAB\s+([IVXLCDM]+)\s*$")
_RE_PASAL = re.compile(r"^Pas[a-z]{2}\s+([0-9lIO]{1,3})\s?([A-Z])?\s*$")
_RE_PAGE = re.compile(r"^[-– ]*\d{1,3}[-– ]*$|^Page\s+\d+\s+of\s+\d+|^Halaman\s+\d+", re.I)
_RE_STOP = re.compile(
    r"^(PEN?D?JELASAN\b|LAMPIRAN\b|Lampiran\s+[IVX\d]+\s*:|Lampiran\s*:\s*$|(?:Ditetapkan|Disahkan)\s+di\b)"
)
_RE_CATCHWORD = re.compile(r"(?:\s\.){3}\s*$")
_RE_BAGIAN = re.compile(r"^(Bagian|Paragraf)\s+[A-Za-z]+\s*$")
_RE_HEADING_TAIL = re.compile(r"^[A-Z][A-Z0-9 ,.\-/()']{2,}$")
_KEEP = re.compile(r"^(Pasal|BAB|Bagian|Paragraf)\b|^\(?\d+[.)]|^[a-z][.)]\s")
_DIGITFIX = str.maketrans({"l": "1", "I": "1", "O": "0"})


def extract_pages(pdf_path: Path) -> list[str]:
    """Teks per halaman memakai pdfplumber (lapisan teks PDF; tanpa OCR)."""
    import pdfplumber

    with pdfplumber.open(pdf_path) as pdf:
        return [p.extract_text() or "" for p in pdf.pages]


def clean_pages(pages: list[str]) -> str:
    """Gabungkan halaman menjadi satu teks bersih.

    Dibuang: nomor halaman dan baris kepala/kaki yang berulang di lebih dari sepertiga halaman
    (angka dianggap sama, jadi "Page 9 of 22 ..." ikut terbuang). Tanda hubung di ujung baris
    dipertahankan. Isi teks tidak diubah selain itu.
    """
    norm = [unicodedata.normalize("NFKC", p) for p in pages]
    counts: Counter[str] = Counter()
    for p in norm:
        for key in {re.sub(r"\d+", "#", ln.strip()) for ln in p.splitlines() if ln.strip()}:
            counts[key] += 1
    limit = len(norm) / 3
    out: list[str] = []
    for p in norm:
        page_lines = [ln.strip() for ln in p.splitlines() if ln.strip()]
        # Kata sambung di dasar halaman ("sumber . . .") diulang di awal halaman berikutnya;
        # buang salinannya.
        tail = {len(page_lines) - 1 - k for k in range(2) if len(page_lines) > k}
        for idx, line in enumerate(page_lines):
            if _RE_PAGE.match(line) or (idx in tail and _RE_CATCHWORD.search(line)):
                continue
            if (
                len(norm) >= 6
                and counts[re.sub(r"\d+", "#", line)] > limit
                and not _KEEP.match(line)
            ):
                continue
            out.append(line)
    # Tanda hubung di akhir baris dipertahankan: pada teks ini hampir selalu bagian kata ulang
    # atau majemuk (perundang-undangan, sjarat-sjarat), bukan pemenggalan kata.
    return re.sub(r"(\w)-\n(\w)", r"\1-\2", "\n".join(out))


def apply_corrections(text: str, corrections: list[dict]) -> tuple[str, list[dict]]:
    """Terapkan perbaikan teks eksplisit (cari/ganti, harus tepat satu kemunculan)."""
    applied = []
    for c in corrections:
        if text.count(c["cari"]) != 1:
            raise ValueError(f"perbaikan tidak unik atau tidak ditemukan: {c['cari']!r}")
        text = text.replace(c["cari"], c["ganti"])
        applied.append(c)
    return text, applied


@dataclass
class Unit:
    """Satu pasal dengan konteks BAB."""

    doc_id: str
    label: str  # mis. "Pasal 5" atau "Pasal 12A"
    number: int
    bab: str = ""
    heading: str = ""
    lines: list[str] = field(default_factory=list)
    catatan: str = ""

    @property
    def text(self) -> str:
        return "\n".join(self.lines).strip()

    @property
    def uid(self) -> str:
        return f"{self.doc_id}#{self.label.lower().replace(' ', '-')}"


def _one_digit_off(a: int, b: int) -> bool:
    sa, sb = str(a), str(b)
    return len(sa) == len(sb) and sum(x != y for x, y in zip(sa, sb, strict=True)) == 1


def parse_units(text: str, doc_id: str, warnings: list[str] | None = None) -> list[Unit]:
    """Pecah batang tubuh menjadi unit per pasal.

    Baris "Pasal N" hanya diterima sebagai judul bila nomornya berurutan (N = nomor
    sebelumnya + 1, atau huruf lanjutan seperti 12A). Baris yang tampak seperti judul tetapi
    tidak berurutan dianggap rujukan di dalam kalimat.

    Perbaikan OCR: pada PDF pindaian, satu digit nomor kadang salah baca (166 menjadi 156).
    Judul yang kembar dengan nomor sebelumnya, atau selisihnya tepat satu digit (dan lebih dari 1)
    dari nomor yang diharapkan, berdiri sendiri, dan diikuti awal kalimat (huruf kapital atau
    "(1)") diterima sebagai nomor yang diharapkan dan dicatat di Unit.catatan serta di peringatan.
    """
    warn = warnings if warnings is not None else []
    units: list[Unit] = []
    bab = heading = ""
    expect_heading = False
    skip = 0
    cur: Unit | None = None
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if _RE_STOP.match(line) and units:
            break
        m = _RE_BAB.match(line)
        if m:
            bab, heading, expect_heading = f"BAB {m.group(1)}", "", True
            continue
        if expect_heading:
            if _RE_HEADING_TAIL.match(line) and not _RE_PASAL.match(line):
                heading = f"{heading} {line}".strip()
                continue
            expect_heading = False
        if _RE_BAGIAN.match(line) and cur is not None:
            # "Bagian Kedua" dan judulnya (satu sampai tiga baris) bukan isi pasal sebelumnya.
            bagian = [line]
            for follow in lines[i + 1 : i + 4]:
                if _RE_PASAL.match(follow) or follow.startswith("("):
                    break
                bagian.append(follow)
            heading = f"{heading.split(' / ')[0]} / {' '.join(bagian)}".strip(" /")
            skip = len(bagian) - 1
            continue
        if skip:
            skip -= 1
            continue
        m = _RE_PASAL.match(line)
        if m:
            num = int(m.group(1).translate(_DIGITFIX))
            suffix = m.group(2) or ""
            prev = units[-1] if units else None
            expected = prev.number + 1 if prev else 1
            nxt = lines[i + 1] if i + 1 < len(lines) else ""
            starts_sentence = bool(re.match(r"^(\(\d+\)|[A-Z0-9])", nxt))
            if (prev is None and num == 1 and not suffix) or (
                prev is not None
                and ((num == expected and not suffix) or (suffix and num == prev.number))
            ):
                cur = Unit(doc_id, f"Pasal {num}{suffix}", num, bab, heading)
                units.append(cur)
                continue
            repairable = (abs(num - expected) > 1 and _one_digit_off(num, expected)) or (
                prev is not None and num == prev.number
            )
            if not suffix and starts_sentence and repairable:
                note = (
                    f"Nomor pasal terbaca {num} pada teks OCR; "
                    f"diperbaiki menjadi {expected} sesuai urutan."
                )
                warn.append(f"{doc_id}: {note}")
                cur = Unit(doc_id, f"Pasal {expected}", expected, bab, heading, catatan=note)
                units.append(cur)
                continue
        if cur is not None:
            cur.lines.append(line)
    nums = [u.number for u in units]
    if nums and (nums != list(range(1, 1 + len(nums))) and len(set(nums)) != len(nums)):
        warn.append(f"{doc_id}: nomor pasal tidak berurutan")
    return [u for u in units if u.text]
