"""Antarmuka baris perintah: evidence data fetch | build | eval."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "corpus" / "manifest.json"
RAW = ROOT / "data" / "raw"


def _curl(url: str, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["curl", "-sSL", "--fail", "-m", "180", "-A", "Mozilla/5.0", "-o", str(out), url],
        check=True,
    )


def cmd_fetch(_: argparse.Namespace) -> int:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    bad = 0
    for d in manifest["dokumen"]:
        dest = RAW / f"{d['id']}.pdf"
        if not dest.exists():
            print("unduh", d["url_pdf"])
            _curl(d["url_pdf"], dest)
        digest = hashlib.sha256(dest.read_bytes()).hexdigest()
        ok = digest == d["sha256"]
        bad += not ok
        print(("OK    " if ok else "BEDA  ") + d["id"], digest[:12])
    if bad:
        print(
            f"{bad} berkas berbeda dari manifest; sumber mungkin berubah."
            " Periksa sebelum membangun ulang."
        )
    return 1 if bad else 0


def cmd_build(_: argparse.Namespace) -> int:
    from .corpus import build_corpus

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    corpus = build_corpus(manifest, RAW, ROOT / "data" / "processed" / "teks")
    out = ROOT / "corpus" / "korpus.json"
    corpus.write(out)
    print(f"{len(corpus.docs)} dokumen, {len(corpus.chunks)} pasal -> {out}")
    for w in corpus.meta["peringatan_ekstraksi"]:
        print("peringatan:", w)
    return 0


def cmd_evalset(args: argparse.Namespace) -> int:
    from . import evalset
    from .corpus import Corpus

    qpath = ROOT / "eval" / "questions.jsonl"
    if args.action == "build":
        drafts = evalset.load_drafts(ROOT / "eval" / "draft")
        if qpath.exists() and not args.force:
            rows = evalset.merge_frozen(drafts, evalset.read_questions(qpath))
        else:
            rows = evalset.assign_split(drafts)
        evalset.write_questions(rows, qpath)
        print(evalset.summary(rows))
        return 0
    rows = evalset.read_questions(qpath)
    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    problems = evalset.validate(rows, corpus)
    for p in problems:
        print("masalah:", p)
    print(evalset.summary(rows))
    return 1 if problems else 0


def cmd_eval(_: argparse.Namespace) -> int:
    from . import evalrag

    res = evalrag.run(ROOT / "corpus" / "korpus.json", ROOT / "eval" / "questions.jsonl")
    out = ROOT / "eval" / "results.json"
    evalrag.write_results(res, out)
    t = res["jawaban"]["test"]
    print(f"ambang dari dev: {res['ambang']['terpilih']}")
    print("test jawaban benar:", t["jawaban_benar"])
    print("test dijawab padahal tak terjawab:", t["dijawab_padahal_tak_terjawab"])
    print("->", out)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="evidence")
    sub = ap.add_subparsers(dest="cmd", required=True)
    data = sub.add_parser("data").add_subparsers(dest="sub", required=True)
    data.add_parser("fetch", help="unduh PDF resmi dan verifikasi SHA-256").set_defaults(
        fn=cmd_fetch
    )
    sub.add_parser("build", help="ekstrak PDF menjadi korpus per pasal").set_defaults(fn=cmd_build)
    es = sub.add_parser("eval-set", help="bangun atau periksa set pertanyaan evaluasi")
    es.add_argument("action", choices=["build", "check"])
    es.add_argument(
        "--force", action="store_true", help="bagi ulang dari nol (merusak pembekuan split)"
    )
    es.set_defaults(fn=cmd_evalset)
    sub.add_parser("eval", help="jalankan evaluasi lengkap -> eval/results.json").set_defaults(
        fn=cmd_eval
    )
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
