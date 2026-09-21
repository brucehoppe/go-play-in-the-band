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
