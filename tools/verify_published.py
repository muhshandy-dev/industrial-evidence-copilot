"""Periksa situs yang sudah dipublikasikan: jalankan sendiri setelah deploy.

    python tools/verify_published.py https://industrial-evidence-copilot.pages.dev/

Memeriksa status, header keamanan, bahwa data yang disajikan sama dengan isi repositori, dan
status mode generatif. Di domain produksi (status RAG Research Prototype) mode generatif harus
tidak aktif: GET /api/jawab melaporkan aktif false dan POST pengunjung ditolak 503.
Hanya memakai pustaka standar.
"""

from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BERKAS_DATA = {
    "data/korpus.json": ROOT / "web" / "public" / "data" / "korpus.json",
    "data/indeks.json": ROOT / "web" / "public" / "data" / "indeks.json",
    "data/evaluasi.json": ROOT / "web" / "public" / "data" / "evaluasi.json",
    "js/situs.js": ROOT / "web" / "public" / "js" / "situs.js",
}
HOST_PRODUKSI = "industrial-evidence-copilot.pages.dev"


def ambil(url: str, data: bytes | None = None, headers: dict | None = None):
    req = urllib.request.Request(
        url, data=data, headers={"User-Agent": "verify-published/1", **(headers or {})}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return res.status, dict(res.headers), res.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def periksa_generatif(base: str, masalah: list[str]) -> None:
    host = urllib.parse.urlparse(base).hostname
    status, _, isi = ambil(base + "api/jawab")
    if status != 200:
        masalah.append(f"GET api/jawab: HTTP {status}")
        return
    info = json.loads(isi)
    print(f"GET api/jawab: {info}")
    if host != HOST_PRODUKSI:
        return
    if info.get("aktif") is not False or info.get("model") is not None:
        masalah.append("domain produksi: mode generatif masih aktif")
    asal = base.rstrip("/")
    badan = json.dumps({"tanya": "apa kewajiban pengurus", "pasal": ["x"]}).encode()
    status, _, isi = ambil(
        base + "api/jawab", badan, {"Origin": asal, "Content-Type": "application/json"}
    )
    print(f"POST api/jawab (pengunjung): HTTP {status} {isi[:120]!r}")
    if status != 503:
        masalah.append(f"domain produksi: POST pengunjung HTTP {status}, seharusnya 503")


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
    if b"RAG Research Prototype" not in body:
        masalah.append("halaman utama tidak memuat label status RAG Research Prototype")
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

    periksa_generatif(base, masalah)

    if masalah:
        print("\n".join(f"x {m}" for m in masalah))
        return 1
    print("situs terbit dan data sama dengan repositori")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
