"""Content-hash cache so the same file is never separated twice."""
import hashlib
from pathlib import Path


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_dir(root: Path, digest: str) -> Path:
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("not a sha256 hex digest")
    path = root / digest
    path.mkdir(parents=True, exist_ok=True)
    return path
