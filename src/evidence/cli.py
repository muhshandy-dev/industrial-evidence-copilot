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


CONTOH = [
    "Berapa lama masa berlaku Lisensi K3 operator pesawat uap?",
    "Siapa yang wajib melaporkan kecelakaan kerja?",
    "Berapa umur minimal peserta ujian juru las?",
    "Apa itu ruang terbatas?",
    "Berapa tarif BPJS untuk jaminan kecelakaan kerja?",
]


def cmd_export(_: argparse.Namespace) -> int:
    """Tulis data website dari korpus nyata dan hasil evaluasi; menolak bila tidak konsisten."""
    import hashlib

    from .corpus import Corpus
    from .evalrag import build_systems
    from .export_web import write_index

    corpus_path = ROOT / "corpus" / "korpus.json"
    results = json.loads((ROOT / "eval" / "results.json").read_text(encoding="utf-8"))
    sha = hashlib.sha256(corpus_path.read_bytes()).hexdigest()
    if results["korpus"]["sha256"] != sha:
        print("eval/results.json dibuat dari korpus lain; jalankan `evidence eval` dulu.")
        return 1
    corpus = Corpus.read(corpus_path)
    if corpus.asal != "nyata":
        print("hanya korpus nyata yang boleh diekspor ke website.")
        return 1
    key = results["metode_dikirim"]
    system = build_systems(corpus)[key]
    out = ROOT / "web" / "public" / "data"
    out.mkdir(parents=True, exist_ok=True)
    corpus.write(out / "korpus.json")
    size = write_index(system.retriever, out / "indeks.json")
    ev = {**results, "ambang_jawab": results["ambang"]["terpilih"], "contoh": CONTOH}
    (out / "evaluasi.json").write_text(
        json.dumps(ev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"ekspor {key}: indeks {size / 1e6:.2f} MB, ambang {ev['ambang_jawab']}")
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
    sub.add_parser("export", help="tulis data website (web/public/data)").set_defaults(
        fn=cmd_export
    )
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
