"""Jawaban ekstraktif: memilih kalimat (ayat atau butir) dari pasal yang diambil.

Tidak ada model bahasa generatif. Setiap kalimat jawaban adalah salinan persis dari satu
unit di korpus, jadi tidak mungkin ada kalimat karangan. Risiko yang tersisa bukan
karangan, melainkan salah pilih pasal atau menjawab padahal korpus tidak memuat jawabannya;
keduanya diukur di evaluasi.

Algoritma yang sama ditulis ulang di web/public/js/answer.js (paritas diuji).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .text import tokenize

_RE_UNIT_START = re.compile(r"^(\(\d+[a-z]?\)|\d+\.)\s+")
MAX_UNITS = 2
SECOND_RATIO = 0.8


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
    text: str
    score: float


@dataclass(frozen=True)
class Answer:
    abstain: bool
    coverage: (
        float  # 0..1, seberapa banyak istilah pertanyaan (berbobot idf) ada di kandidat teratas
    )
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
    top_chunks: int = 3,
    threshold: float = 0.5,
) -> Answer:
    q_terms = tokenize(query)
    oov = max(idf.values()) if idf else 1.0
    cand: list[Evidence] = []
    best_cov = 0.0
    for rank, ci in enumerate(ranked_chunks[:top_chunks]):
        whole = set(tokenize(chunk_texts[ci]))
        if rank == 0:
            best_cov = coverage(q_terms, whole, idf, oov)
        for ui, unit in enumerate(split_units(chunk_texts[ci])):
            score = coverage(q_terms, set(tokenize(unit)), idf, oov)
            if score > 0:
                cand.append(Evidence(ci, ui, unit, score))
    if best_cov < threshold or not cand:
        return Answer(True, best_cov, ())
    # Skor sama: utamakan chunk berperingkat lebih tinggi, lalu urutan unit.
    order = {ci: r for r, ci in enumerate(ranked_chunks[:top_chunks])}
    cand.sort(key=lambda e: (-e.score, order[e.chunk_idx], e.unit_idx))
    picked = [cand[0]]
    for e in cand[1:]:
        if len(picked) >= MAX_UNITS:
            break
        if e.score >= SECOND_RATIO * cand[0].score:
            picked.append(e)
    return Answer(False, best_cov, tuple(picked))
