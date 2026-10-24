"""Tokenisasi bahasa Indonesia yang sama persis dengan versi JavaScript di website.

Aturan sengaja sederhana supaya bisa dibuat identik di dua bahasa dan diuji dengan
kasus bersama (tests/fixtures/tokenizer_cases.json):

1. NFKC, huruf kecil, ganti semua selain a-z/0-9 dengan spasi.
2. Buang kata henti dan token satu huruf.
3. Stemming ringan (opsional): buang partikel, kata ganti milik, akhiran, lalu awalan.
   Ini bukan stemmer linguistik lengkap. Tujuannya konsistensi antara dokumen dan
   pertanyaan, bukan bentuk dasar yang benar secara kamus.
"""

from __future__ import annotations

import re
import unicodedata

STOPWORDS = frozenset(
    [
        "ada",
        "adalah",
        "agar",
        "akan",
        "atau",
        "antara",
        "apa",
        "apabila",
        "atas",
        "bagi",
        "bahwa",
        "bagaimana",
        "banyak",
        "baik",
        "beberapa",
        "bila",
        "bisa",
        "boleh",
        "dalam",
        "dan",
        "dapat",
        "dari",
        "dengan",
        "di",
        "dua",
        "guna",
        "hal",
        "harus",
        "hingga",
        "ini",
        "itu",
        "jika",
        "juga",
        "kami",
        "karena",
        "ke",
        "kepada",
        "kita",
        "lain",
        "lebih",
        "maka",
        "mana",
        "masing",
        "melalui",
        "mereka",
        "oleh",
        "pada",
        "para",
        "pula",
        "saat",
        "sampai",
        "sebagai",
        "sebuah",
        "seluruh",
        "semua",
        "serta",
        "setiap",
        "suatu",
        "sudah",
        "sehingga",
        "tanpa",
        "tentang",
        "terhadap",
        "tersebut",
        "tetapi",
        "untuk",
        "yang",
        "dimaksud",
        "dimaksudkan",
        "adapun",
        "yaitu",
        "yakni",
        "antar",
        "lagi",
        "saja",
        "lalu",
        "namun",
    ]
)

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_PARTICLES = ("lah", "kah", "tah", "pun")
_POSSESSIVE = ("nya", "ku", "mu")
_SUFFIXES = ("kan", "an")
# Urutan penting: yang lebih panjang dicoba lebih dulu.
_PREFIXES = (
    "meng",
    "meny",
    "peng",
    "peny",
    "mem",
    "men",
    "pem",
    "pen",
    "ber",
    "bel",
    "ter",
    "per",
    "me",
    "pe",
    "di",
    "ke",
    "se",
)
_MIN_STEM = 4
_MELT = {"meny": "s", "peny": "s", "mem": "p", "pem": "p", "men": "t", "pen": "t"}


def _strip_suffix(word: str, suffixes: tuple[str, ...]) -> str:
    for suf in suffixes:
        if word.endswith(suf) and len(word) - len(suf) >= _MIN_STEM:
            return word[: -len(suf)]
    return word


def stem(word: str) -> str:
    """Stemming ringan. Kata pendek dan angka tidak diubah."""
    if len(word) <= _MIN_STEM or word.isdigit():
        return word
    word = _strip_suffix(word, _PARTICLES)
    word = _strip_suffix(word, _POSSESSIVE)
    word = _strip_suffix(word, _SUFFIXES)
    for pre in _PREFIXES:
        if not word.startswith(pre):
            continue
        rest = word[len(pre) :]
        # Peluluhan: meny-/peny- + vokal -> s, mem-/pem- + vokal -> p, men-/pen- + vokal -> t
        # (menyediakan -> sedia, memakai -> pakai, menentukan -> tentu).
        lead = _MELT.get(pre) if rest[:1] in "aiueo" else None
        if lead is None and pre in ("meny", "peny"):
            lead = "s"
        stem_ = (lead or "") + rest
        if len(stem_) >= _MIN_STEM and len(rest) >= 3:
            return stem_
    return word


def tokenize(text: str, *, use_stem: bool = True, drop_stopwords: bool = True) -> list[str]:
    text = unicodedata.normalize("NFKC", text).lower()
    tokens = []
    for tok in _NON_ALNUM.split(text):
        if len(tok) < 2:
            continue
        if drop_stopwords and tok in STOPWORDS:
            continue
        tokens.append(stem(tok) if use_stem else tok)
    return tokens


_OLD_SPELLING_PLACEHOLDERS = (
    ("dj", "\x01", "j"),
    ("tj", "\x02", "c"),
    ("nj", "\x03", "ny"),
    ("sj", "\x04", "sy"),
)


def modernize_spelling(text: str) -> str:
    """Ejaan Republik (sebelum 1972) ke ejaan sekarang, hanya untuk pencocokan kata.

    Dipakai pada dokumen yang ditandai ejaan_lama di manifest (UU 1/1970). Teks yang ditampilkan
    dan dikutip tetap asli. Urutan penting: "j" lama berarti "y", jadi dj/tj/nj/sj diamankan dulu.
    """
    text = text.lower()
    for old, token, _ in _OLD_SPELLING_PLACEHOLDERS:
        text = text.replace(old, token)
    text = text.replace("j", "y")
    for _, token, new in _OLD_SPELLING_PLACEHOLDERS:
        text = text.replace(token, new)
    return text.replace("ch", "kh").replace("oe", "u")
