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
DIGEST = ROOT / "eval" / "test-beku.sha256"


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
        if not DIGEST.exists():
            DIGEST.write_text(evalset.test_digest(rows) + "\n", encoding="utf-8")
        print(evalset.summary(rows))
        return 0
    rows = evalset.read_questions(qpath)
    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    problems = evalset.validate(rows, corpus)
    if DIGEST.exists() and DIGEST.read_text().strip() != evalset.test_digest(rows):
        problems.append("label pertanyaan test berubah dari yang dibekukan (eval/test-beku.sha256)")
    for p in problems:
        print("masalah:", p)
    print(evalset.summary(rows))
    return 1 if problems else 0


def cmd_eval(args: argparse.Namespace) -> int:
    from . import evalrag

    res = evalrag.run(ROOT / "corpus" / "korpus.json", ROOT / "eval" / "questions.jsonl")
    out = Path(args.out) if args.out else ROOT / "eval" / "results.json"
    evalrag.write_results(res, out)
    # Angka test sengaja tidak dicetak: lihat hasilnya di berkas, bukan di tiap iterasi.
    print(f"metode: {res['metode_dikirim']}, ambang dari dev: {res['ambang']['terpilih']}")
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
    results = {k: v for k, v in results.items() if k != "per_pertanyaan"}
    ev = {**results, "ambang_jawab": results["ambang"]["terpilih"], "contoh": CONTOH}
    sealed_path = ROOT / "eval" / "sealed" / "hasil.json"
    if sealed_path.exists():
        hasil = json.loads(sealed_path.read_text(encoding="utf-8"))
        for g in hasil["generatif"].values():
            g.pop("per_pertanyaan", None)
        ev["tersegel"] = hasil
    (out / "evaluasi.json").write_text(
        json.dumps(ev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"ekspor {key}: indeks {size / 1e6:.2f} MB, ambang {ev['ambang_jawab']}")
    return 0


def _all_queries() -> list[str]:
    """Semua teks pertanyaan yang perlu embedding: set dev/test, uji tekanan, set tersegel."""
    from .evalset import read_questions

    out: list[str] = []
    for rel in (
        "questions.jsonl",
        "stress.jsonl",
        "sealed/questions.jsonl",
        "sealed/injeksi.jsonl",
    ):
        p = ROOT / "eval" / rel
        if p.exists():
            out += [r["tanya"] for r in read_questions(p)]
    return list(dict.fromkeys(out))


def cmd_embed(args: argparse.Namespace) -> int:
    """Hitung embedding pasal dan pertanyaan dengan sentence-transformers (butuh internet)."""
    from .corpus import Corpus
    from .dense import MODELS, cache_dir, encode_and_cache
    from .evalrag import corpus_sha

    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    passages = [corpus.index_text(i) for i in range(len(corpus.chunks))]
    queries = _all_queries()
    for key in args.model or list(MODELS):
        meta = encode_and_cache(key, passages, queries, cache_dir(ROOT, key), corpus_sha(corpus))
        print(f"{key}: {meta['pasal']} pasal, {len(meta['pertanyaan'])} pertanyaan")
    return 0


def cmd_rerank(args: argparse.Namespace) -> int:
    """Skor cross-encoder untuk pool kandidat (BM25 dan semua model embedding yang ada)."""
    from .corpus import Corpus
    from .dense import text_key
    from .evalrag import build_systems, corpus_sha
    from .rerank import POOL, RERANKERS, cache_path, score_and_cache

    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    systems = build_systems(corpus, ROOT)
    first = [s for k, s in systems.items() if k == "bm25_konteks" or k.startswith("dense_")]
    queries = {text_key(q): q for q in _all_queries()}
    pairs = {
        qk: sorted({ci for s in first for ci in s.search(q, POOL)}) for qk, q in queries.items()
    }
    passages = [corpus.index_text(i) for i in range(len(corpus.chunks))]
    ids = [c.id for c in corpus.chunks]
    # Shard per pertanyaan (urutan kunci tetap), supaya beberapa runner bekerja paralel.
    keys = sorted(pairs)[args.shard :: args.shards]
    pairs = {k: pairs[k] for k in keys}
    print(f"{len(pairs)} pertanyaan, {sum(map(len, pairs.values()))} pasangan")
    for key in args.model or list(RERANKERS):
        out = cache_path(ROOT, key)
        if args.shards > 1:
            out = Path(args.out_dir) / f"{key}.shard-{args.shard}.json"
        score_and_cache(key, pairs, queries, passages, ids, out, corpus_sha(corpus))
        print(f"{key}: selesai -> {out}")
    return 0


def cmd_rerank_merge(args: argparse.Namespace) -> int:
    """Gabungkan skor reranker dari beberapa shard ke eval/cache/rerank/<kunci>/skor.json."""
    from .rerank import RERANKERS, cache_path

    by_repo = {repo: key for key, (repo, _, _) in RERANKERS.items()}
    merged: dict[str, dict] = {}
    for f in args.files:
        part = json.loads(Path(f).read_text(encoding="utf-8"))
        key = by_repo[part["model"]]
        m = merged.setdefault(key, {**part, "skor": {}})
        for k in ("model", "revisi", "korpus_sha256"):
            if m[k] != part[k]:
                raise SystemExit(f"{f}: {k} berbeda dari shard lain")
        m["skor"].update(part["skor"])
    for key, m in merged.items():
        out = cache_path(ROOT, key)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(m, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{key}: {len(m['skor'])} pertanyaan -> {out}")
    return 0


def _shipped():
    from .corpus import Corpus
    from .evalrag import build_systems

    results = json.loads((ROOT / "eval" / "results.json").read_text(encoding="utf-8"))
    corpus = Corpus.read(ROOT / "corpus" / "korpus.json")
    system = build_systems(corpus, ROOT)[results["metode_dikirim"]]
    return corpus, system, results["ambang"]["terpilih"]


def _generative():
    """Sistem urutan pasal untuk mode generatif (BM25 + reranker), korpus, dan ambang."""
    from .evalrag import build_systems
    from .generation import SISTEM_GENERATIF

    corpus, _, threshold = _shipped()
    systems = build_systems(corpus, ROOT)
    if SISTEM_GENERATIF not in systems:
        raise SystemExit(f"{SISTEM_GENERATIF} belum ada; jalankan workflow Model (rerank) dulu")
    return corpus, systems[SISTEM_GENERATIF], threshold


def cmd_gen_input(args: argparse.Namespace) -> int:
    """Masukan generator: peringkat pasal dan keputusan gerbang dari metode yang dikirim."""
    from .generation import gen_input, load_set

    sets = args.set.split(",")
    if "sealed" in sets:
        print("set tersegel hanya lewat `evidence eval-sealed`.", file=sys.stderr)
        return 1
    corpus, system, threshold = _generative()
    lines = []
    for s in sets:
        lines += gen_input(corpus, system, load_set(ROOT, s), s, threshold)
    text = "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in lines)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        sys.stdout.write(text)
    return 0


def cmd_gen_merge(args: argparse.Namespace) -> int:
    """Gabungkan keluaran shard generator ke eval/cache/gen/<varian>/<set>.jsonl (ganti per id)."""
    from .generation import gen_dir, konfigurasi

    new: dict[tuple[str, str], dict[str, dict]] = {}
    for f in args.files:
        for line in Path(f).read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                new.setdefault((konfigurasi(r["varian"], r["model"]), r["set"]), {})[r["id"]] = r
    for (varian, s), recs in sorted(new.items()):
        path = gen_dir(ROOT, varian) / f"{s}.jsonl"
        old = {}
        if path.exists():
            old = {
                (r := json.loads(x))["id"]: r
                for x in path.read_text(encoding="utf-8").splitlines()
                if x.strip()
            }
        old.update(recs)
        path.parent.mkdir(parents=True, exist_ok=True)
        rows = sorted(old.values(), key=lambda r: r["id"])
        path.write_text(
            "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8"
        )
        print(f"{varian}/{s}: {len(recs)} baru, {len(rows)} total")
    return 0


def cmd_nli(_: argparse.Namespace) -> int:
    """Skor entailment untuk kalimat jawaban generatif (butuh internet)."""
    from .generation import (
        KONFIGURASI,
        SETS,
        nli_pairs,
        nli_path,
        read_outputs,
        score_nli_and_cache,
    )

    parsed = [r for v in KONFIGURASI for r in read_outputs(ROOT, v, SETS)]
    pairs = nli_pairs(parsed)
    print(f"{len(parsed)} jawaban, {len(pairs)} pasangan premis-hipotesis")
    score_nli_and_cache(pairs, nli_path(ROOT))
    return 0


def cmd_eval_sealed(args: argparse.Namespace) -> int:
    """Set tersegel, sekali jalan: `input` menulis masukan generator, `run` menulis hasil."""
    from . import sealed

    sealed.guard(ROOT)
    if args.action == "input":
        from .generation import gen_input

        corpus, system, threshold = _generative()
        rows = sealed.load_rows(ROOT, corpus)
        lines = gen_input(corpus, system, rows, "sealed", threshold)
        Path(args.out).write_text(
            "".join(json.dumps(x, ensure_ascii=False) + "\n" for x in lines), encoding="utf-8"
        )
        print(f"{len(lines)} pertanyaan tersegel -> {args.out}")
        return 0
    res = sealed.run(ROOT)
    out = sealed.result_path(ROOT)
    out.write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
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
    ev = sub.add_parser("eval", help="jalankan evaluasi lengkap -> eval/results.json")
    ev.add_argument("--out", help="tulis ke berkas lain, tidak menimpa eval/results.json")
    ev.set_defaults(fn=cmd_eval)
    em = sub.add_parser("embed", help="embedding pasal dan pertanyaan -> eval/cache/emb")
    em.add_argument("--model", action="append", help="kunci model (default: semua)")
    em.set_defaults(fn=cmd_embed)
    rr = sub.add_parser("rerank", help="skor cross-encoder kandidat -> eval/cache/rerank")
    rr.add_argument("--model", action="append", help="kunci reranker (default: semua)")
    rr.add_argument("--shard", type=int, default=0)
    rr.add_argument("--shards", type=int, default=1)
    rr.add_argument("--out-dir", default="rerank-shard", help="tempat skor shard (shards > 1)")
    rr.set_defaults(fn=cmd_rerank)
    rm = sub.add_parser("rerank-merge", help="gabungkan skor reranker dari shard")
    rm.add_argument("files", nargs="+")
    rm.set_defaults(fn=cmd_rerank_merge)
    gi = sub.add_parser("gen-input", help="masukan generator (peringkat pasal dan gerbang)")
    gi.add_argument("--set", default="dev,test,stress", help="dev,test,stress,injeksi")
    gi.add_argument("--out")
    gi.set_defaults(fn=cmd_gen_input)
    gm = sub.add_parser("gen-merge", help="gabungkan keluaran shard generator")
    gm.add_argument("files", nargs="+")
    gm.set_defaults(fn=cmd_gen_merge)
    sub.add_parser("nli", help="skor NLI kalimat jawaban -> eval/cache/nli").set_defaults(
        fn=cmd_nli
    )
    es2 = sub.add_parser("eval-sealed", help="set tersegel, sekali jalan -> eval/sealed/hasil.json")
    es2.add_argument("action", choices=["input", "run"])
    es2.add_argument("--out", default="masukan.jsonl")
    es2.set_defaults(fn=cmd_eval_sealed)
    sub.add_parser("export", help="tulis data website (web/public/data)").set_defaults(
        fn=cmd_export
    )
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
