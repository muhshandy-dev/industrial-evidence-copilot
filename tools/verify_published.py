"""Periksa situs yang sudah dipublikasikan: jalankan sendiri setelah deploy.

    python tools/verify_published.py https://industrial-evidence-copilot.pages.dev/

Memeriksa status, header keamanan, dan bahwa data yang disajikan sama dengan isi repositori.
Hanya memakai pustaka standar.
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BERKAS_DATA = {
    "data/korpus.json": ROOT / "web" / "public" / "data" / "korpus.json",
    "data/indeks.json": ROOT / "web" / "public" / "data" / "indeks.json",
    "data/evaluasi.json": ROOT / "web" / "public" / "data" / "evaluasi.json",
}


def ambil(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "verify-published/1"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.status, dict(res.headers), res.read()


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    base = argv[1].rstrip("/") + "/"
    masalah: list[str] = []

    status, headers, body = ambil(base)
    h = {k.lower(): v for k, v in headers.items()}
    if status != 200:
        masalah.append(f"halaman utama HTTP {status}")
    if b"Industrial Evidence Copilot" not in body:
        masalah.append("halaman utama tidak memuat judul situs")
    csp = h.get("content-security-policy", "")
    if "default-src 'none'" not in csp or "unsafe-" in csp:
        masalah.append("CSP tidak sesuai")
    for kunci in ("x-content-type-options", "x-frame-options", "referrer-policy"):
        if kunci not in h:
            masalah.append(f"header {kunci} hilang")

    for jalur, lokal in BERKAS_DATA.items():
        status, _, isi = ambil(base + jalur)
        if status != 200:
            masalah.append(f"{jalur}: HTTP {status}")
        elif hashlib.sha256(isi).hexdigest() != hashlib.sha256(lokal.read_bytes()).hexdigest():
            masalah.append(f"{jalur}: isi berbeda dari repositori")

    if masalah:
        print("\n".join(f"x {m}" for m in masalah))
        return 1
    print("situs terbit dan data sama dengan repositori")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
