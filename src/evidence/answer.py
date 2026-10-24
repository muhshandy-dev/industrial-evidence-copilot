"""Jawaban ekstraktif: memilih kalimat (ayat atau butir) dari pasal teratas.

Tidak ada model bahasa generatif. Setiap kalimat jawaban adalah salinan persis dari satu
unit di korpus, jadi tidak mungkin ada kalimat karangan. Risiko yang tersisa bukan
karangan, melainkan salah pilih pasal atau menjawab padahal korpus tidak memuat jawabannya;
keduanya diukur di evaluasi.

Dua keputusan, dibuat setelah run pertama dari analisis split dev; test juga sudah terlihat
saat itu (lihat docs/evaluasi.md):
- Gerbang penolakan memakai skor BM25 pasal teratas, bukan kecocokan kata, karena skor
  BM25 lebih baik memisahkan pertanyaan yang terjawab dari yang tidak.
- Kutipan hanya diambil dari pasal peringkat 1, supaya sitasi selalu sama dengan hasil
  pencarian dan bisa diperiksa.

Algoritma yang sama ditulis ulang di web/public/js/answer.js (paritas diuji).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .text import tokenize

_RE_UNIT_START = re.compile(r"^(\(\d+[a-z]?\)|\d+\.)\s+")
MAX_UNITS = 3
SECOND_RATIO = 0.6


def split_units(text: str) -> list[str]:
    """Pecah teks pasal menjadi ayat atau butir bernomor. Teks tanpa penomoran tetap satu unit."""
    units: list[list[str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if _RE_UNIT_START.match(line) or not units:
            units.append([line])
        else:
            units[-1].append(line)
    return [" ".join(u) for u in units]


@dataclass(frozen=True)
class Evidence:
    chunk_idx: int
    unit_idx: int
    text: str  # ayat atau butir persis seperti di dokumen (tampilan dan kutipan)
    score: float
    match: str = ""  # unit yang sama dalam ejaan modern, dipakai untuk pencocokan dan penilaian


@dataclass(frozen=True)
class Answer:
    abstain: bool
    score: float  # skor BM25 pasal teratas; dasar keputusan menolak
    coverage: float  # 0..1, bobot idf istilah pertanyaan yang ada di pasal teratas (informasi)
    evidence: tuple[Evidence, ...]


def coverage(
    query_terms: list[str], text_terms: set[str], idf: dict[str, float], oov_idf: float
) -> float:
    """Porsi bobot idf istilah pertanyaan yang muncul di teks. Istilah di luar kosakata korpus
    diberi bobot idf tertinggi karena justru itu tanda pertanyaan di luar cakupan."""
    uniq = list(dict.fromkeys(query_terms))
    total = sum(idf.get(t, oov_idf) for t in uniq)
    if total == 0:
        return 0.0
    return sum(idf.get(t, oov_idf) for t in uniq if t in text_terms) / total


def extract_answer(
    query: str,
    ranked_chunks: list[int],
    chunk_texts: list[str],
    idf: dict[str, float],
    *,
    top_score: float,
    threshold: float,
    display_texts: list[str] | None = None,
) -> Answer:
    """chunk_texts: teks untuk pencocokan. display_texts: teks asli untuk ditampilkan; hanya
    berbeda pada dokumen berejaan lama. Pembagian ayat dilakukan per baris sehingga indeks unit
    keduanya sejajar. top_score: skor BM25 pasal peringkat 1; threshold: ambang penolakan."""
    if not ranked_chunks:
        return Answer(True, top_score, 0.0, ())
    q_terms = tokenize(query)
    oov = max(idf.values()) if idf else 1.0
    ci = ranked_chunks[0]
    cov = coverage(q_terms, set(tokenize(chunk_texts[ci])), idf, oov)
    if top_score < threshold:
        return Answer(True, top_score, cov, ())
    units = split_units(chunk_texts[ci])
    shown = split_units(display_texts[ci]) if display_texts else units
    if len(shown) != len(units):
        shown = units
    cand = [
        Evidence(ci, ui, shown[ui], s, u)
        for ui, u in enumerate(units)
        if (s := coverage(q_terms, set(tokenize(u)), idf, oov)) > 0
    ]
    if not cand:
        return Answer(True, top_score, cov, ())
    # Skor sama: utamakan unit yang lebih awal.
    cand.sort(key=lambda e: (-e.score, e.unit_idx))
    picked = [cand[0]]
    for e in cand[1:]:
        if len(picked) >= MAX_UNITS:
            break
        if e.score >= SECOND_RATIO * cand[0].score:
            picked.append(e)
    # Tampilkan menurut urutan di pasal agar kutipan terbaca wajar.
    picked.sort(key=lambda e: e.unit_idx)
    return Answer(False, top_score, cov, tuple(picked))
