"""Set pertanyaan evaluasi: gabung draf, bagi dev/test, dan validasi terhadap korpus.

Pembagian dev/test dibuat sekali, dibekukan di eval/questions.jsonl, lalu hanya diperiksa
(bukan dihitung ulang) agar tidak ada pertanyaan test yang berpindah. Label pertanyaan test
(gold, gold_alt, kunci, gaya) juga dibekukan lewat digest di eval/test-beku.sha256.

Catatan jujur: set test ini bukan holdout tersegel. Ia sudah dilihat sebelum desain akhir
dan label gold_alt-nya dinilai setelah keluaran sistem terlihat (lihat docs/evaluasi.md).
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

from .corpus import Corpus

SEED = "evidence-copilot-v1"
DEV_SHARE = 0.4
GAYA = {"leksikal", "parafrase", "dekat", "luar"}

_RE_TOKEN = re.compile(r"[a-z0-9]+(?:[.,/x%-][a-z0-9]+)*%?")
# Penanda ayat "(1)" dan butir "1." bukan isi; dibuang agar angka kunci tidak lolos karenanya.
_RE_MARKER = re.compile(r"\(\d+[a-z]?\)|(?m:^\s*\d+\.(?=\s))")
LABEL_FIELDS = ("tanya", "gold", "gold_alt", "kunci", "gaya")


def key_tokens(text: str) -> set[str]:
    """Token untuk memeriksa kunci fakta: huruf kecil, angka dan satuan utuh. Teks yang diperiksa
    harus teks cocok (ejaan modern), yaitu Corpus.match_text, bukan teks tampilan."""
    return set(_RE_TOKEN.findall(_RE_MARKER.sub(" ", text.lower())))


def relevant(row: dict) -> set[str]:
    """Bukti yang dianggap sah: bukti emas utama ditambah jawaban alternatif yang diverifikasi."""
    return set(row["gold"]) | set(row.get("gold_alt", []))


def key_hit(kunci: list[str], text: str) -> bool:
    """Semua butir kunci ada di teks (tas-kata, tanpa urutan)."""
    toks = key_tokens(text)
    return all(key_tokens(k) <= toks for k in kunci)


def _rank(question: str) -> str:
    return hashlib.sha256(f"{SEED}|{question}".encode()).hexdigest()


def load_drafts(draft_dir: Path) -> list[dict]:
    rows: list[dict] = []
    for p in sorted(draft_dir.glob("*.jsonl")):
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    return rows


def assign_split(rows: list[dict]) -> list[dict]:
    """Beri id dan split. Strata: dokumen emas untuk yang terjawab, gaya untuk yang tidak."""
    strata: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        key = r["gold"][0].split("#")[0] if r["gold"] else "tak-terjawab:" + r["gaya"]
        strata[key].append(r)
    for members in strata.values():
        members.sort(key=lambda r: _rank(r["tanya"]))
        n_dev = max(1, round(len(members) * DEV_SHARE))
        for i, r in enumerate(members):
            r["split"] = "dev" if i < n_dev else "test"
    ordered = sorted(rows, key=lambda r: (r["split"], _rank(r["tanya"])))
    for i, r in enumerate(ordered, start=1):
        r["id"] = f"q{i:03d}"
    return ordered


def _label(r: dict) -> dict:
    listy = ("gold", "gold_alt", "kunci")
    return {k: r.get(k, []) if k in listy else r.get(k) for k in LABEL_FIELDS}


def test_digest(rows: list[dict]) -> str:
    """Sidik label seluruh pertanyaan test, urut menurut id. Berubah bila label test berubah."""
    test = sorted((r for r in rows if r["split"] == "test"), key=lambda r: r["id"])
    blob = json.dumps(
        [{"id": r["id"], **_label(r)} for r in test], ensure_ascii=False, sort_keys=True
    )
    return hashlib.sha256(blob.encode()).hexdigest()


def merge_frozen(drafts: list[dict], frozen: list[dict]) -> list[dict]:
    """Tambah pertanyaan baru tanpa mengubah id, split, atau label test yang sudah dibekukan.

    Pertanyaan baru wajib menyatakan split sendiri (dalam praktik hanya "dev"), sehingga
    tidak ada pertanyaan test yang bisa muncul atau berpindah setelah hasil terlihat.
    """
    old = {r["tanya"]: r for r in frozen}
    out: list[dict] = []
    top = max((int(r["id"][1:]) for r in frozen), default=0)
    for d in drafts:
        if d["tanya"] in old:
            keep = old[d["tanya"]]
            if keep["split"] == "test" and _label(d) != _label(keep):
                raise SystemExit(f"label pertanyaan test {keep['id']} berubah; test dibekukan")
            out.append({**d, "id": keep["id"], "split": keep["split"]})
        else:
            if d.get("split") != "dev":
                raise SystemExit(f"pertanyaan baru harus ber-split dev: {d['tanya']!r}")
            top += 1
            out.append({**d, "id": f"q{top:03d}"})
    gone = set(old) - {d["tanya"] for d in drafts}
    if gone:
        raise SystemExit(f"{len(gone)} pertanyaan beku hilang dari draf")
    return sorted(out, key=lambda r: int(r["id"][1:]))


def write_questions(rows: list[dict], path: Path) -> None:
    path.write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8"
    )


def read_questions(path: Path) -> list[dict]:
    return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]


def validate(
    rows: list[dict], corpus: Corpus, splits: tuple[str, ...] = ("dev", "test")
) -> list[str]:
    """Daftar masalah; kosong berarti set pertanyaan konsisten dengan korpus. Set tersegel
    memakai splits=("sealed",)."""
    problems: list[str] = []
    by_id = {c.id: i for i, c in enumerate(corpus.chunks)}
    seen: set[str] = set()
    for r in rows:
        qid = r.get("id", "?")
        if r["tanya"] in seen:
            problems.append(f"{qid}: pertanyaan ganda")
        seen.add(r["tanya"])
        if r["gaya"] not in GAYA:
            problems.append(f"{qid}: gaya tidak dikenal {r['gaya']!r}")
        if r.get("split") not in splits:
            problems.append(f"{qid}: split tidak valid")
        if not r["gold"]:
            if r["gaya"] not in ("dekat", "luar") or r["kunci"]:
                problems.append(
                    f"{qid}: pertanyaan tak terjawab harus bergaya dekat/luar, tanpa kunci"
                )
            continue
        if r["gaya"] in ("dekat", "luar"):
            problems.append(f"{qid}: pertanyaan terjawab tidak boleh bergaya {r['gaya']}")
        if not r["kunci"]:
            problems.append(f"{qid}: kunci kosong")
        for g in [*r["gold"], *r.get("gold_alt", [])]:
            if g not in by_id:
                problems.append(f"{qid}: bukti {g} tidak ada di korpus")
        if not any(g in by_id for g in r["gold"]):
            continue
        if set(r.get("gold_alt", [])) & set(r["gold"]):
            problems.append(f"{qid}: gold_alt tumpang tindih dengan gold")
        gold_text = " ".join(corpus.match_text(by_id[g]) for g in r["gold"] if g in by_id)
        missing = [k for k in r["kunci"] if not key_hit([k], gold_text)]
        if missing:
            problems.append(f"{qid}: kunci {missing} tidak ada di bukti emas {r['gold']}")
    return problems


def summary(rows: list[dict]) -> dict:
    out: dict = {"total": len(rows), "terjawab": 0, "tak_terjawab": 0, "dev": 0, "test": 0}
    gaya: dict[str, int] = defaultdict(int)
    for r in rows:
        out["tak_terjawab" if not r["gold"] else "terjawab"] += 1
        out[r["split"]] += 1
        gaya[r["gaya"]] += 1
    out["gaya"] = dict(sorted(gaya.items()))
    return out
