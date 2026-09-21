import pytest
from fastapi.testclient import TestClient

from app import app
from cache import cache_dir, content_hash

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"ok": True}


def test_hash_is_stable_sha256():
    assert content_hash(b"abc") == content_hash(b"abc")
    assert len(content_hash(b"abc")) == 64


def test_cache_dir_rejects_path_tricks(tmp_path):
    with pytest.raises(ValueError):
        cache_dir(tmp_path, "../../etc")
    assert cache_dir(tmp_path, content_hash(b"x")).is_dir()


def test_stem_rejects_bad_names():
    good = "a" * 64
    assert client.get(f"/stems/{good}/..%2Fx.wav").status_code in (400, 404)
    assert client.get(f"/stems/{good}/x.txt").status_code == 400
    assert client.get("/stems/nothex/x.wav").status_code == 400
    assert client.get(f"/stems/{good}/missing.wav").status_code == 404


def test_only_our_origins_may_call():
    ok = client.get("/health", headers={"Origin": "https://brucehoppe.github.io"})
    assert ok.headers.get("access-control-allow-origin") == "https://brucehoppe.github.io"
    assert ok.headers.get("access-control-allow-private-network") == "true"
    bad = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    assert "access-control-allow-private-network" not in bad.headers


def test_audible_stems_drops_silent_ones_and_sorts_loudest_first(tmp_path):
    np = pytest.importorskip("numpy")
    sf = pytest.importorskip("soundfile")
    from app import audible_stems

    sub = tmp_path / "htdemucs_6s"
    sub.mkdir()
    tone = np.sin(np.linspace(0, 2000, 8000))
    sf.write(sub / "guitar.wav", tone * 0.5, 8000)
    sf.write(sub / "bass.wav", tone * 0.1, 8000)
    sf.write(sub / "piano.wav", tone * 0.0001, 8000)
    sf.write(sub / "vocals.wav", tone * 0.0, 8000)
    assert audible_stems(tmp_path) == ["guitar.wav", "bass.wav"]
    assert audible_stems(tmp_path / "nothing") == []
