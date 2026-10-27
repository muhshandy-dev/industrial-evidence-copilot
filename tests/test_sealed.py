import json
import shutil
from pathlib import Path

import pytest

from evidence import sealed

ROOT = Path(__file__).resolve().parents[1]


def _copy(tmp_path: Path) -> Path:
    (tmp_path / "eval" / "sealed").mkdir(parents=True)
    shutil.copy(ROOT / "eval" / "sealed.sha256", tmp_path / "eval")
    for name in sealed.SET_FILES:
        shutil.copy(ROOT / "eval" / name, tmp_path / "eval" / name)
    return tmp_path


def test_set_tersegel_sama_dengan_hash_yang_dicommit():
    assert sealed.check_digest(ROOT) == []


def test_perubahan_label_ditolak(tmp_path):
    root = _copy(tmp_path)
    p = root / "eval" / "sealed" / "questions.jsonl"
    p.write_text(p.read_text(encoding="utf-8") + "\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="berubah"):
        sealed.guard(root)


def test_sekali_jalan(tmp_path):
    root = _copy(tmp_path)
    sealed.guard(root)  # belum pernah dijalankan: lolos
    sealed.result_path(root).write_text(json.dumps({}), encoding="utf-8")
    with pytest.raises(SystemExit, match="sudah dievaluasi"):
        sealed.guard(root)


def test_hasil_tersegel_bila_ada_cocok_dengan_set():
    p = sealed.result_path(ROOT)
    if not p.exists():
        pytest.skip("set tersegel belum dijalankan")
    hasil = json.loads(p.read_text(encoding="utf-8"))
    assert sealed.check_digest(ROOT) == []
    for name, h in hasil["set"]["sha256"].items():
        assert (ROOT / "eval" / name).exists() and len(h) == 64


def test_evaluasi_biasa_tidak_menyentuh_set_tersegel():
    src = (ROOT / "src" / "evidence" / "generation.py").read_text(encoding="utf-8")
    assert 'sets = ("dev", "test", "stress", "injeksi")' in src
