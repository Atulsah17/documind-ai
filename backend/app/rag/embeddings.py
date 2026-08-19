"""Embedding backend.

Uses fastembed (ONNX, no PyTorch) for real semantic embeddings. Falls back to a
deterministic hashing embedder when fastembed/model download is unavailable, so
the app and tests always run offline.
"""
from __future__ import annotations

import hashlib

import numpy as np


class HashingEmbedder:
    """Lightweight, offline fallback embedder (bag-of-hashed-words)."""

    def __init__(self, dim: int = 384) -> None:
        self.dim = dim
        self.name = "hashing-fallback"

    def _embed_one(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        for token in text.lower().split():
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            vec[h % self.dim] += 1.0
        norm = np.linalg.norm(vec)
        return vec / norm if norm else vec

    def embed(self, texts: list[str]) -> np.ndarray:
        return np.vstack([self._embed_one(t) for t in texts]) if texts else np.zeros((0, self.dim))


class FastEmbedEmbedder:
    """Real semantic embeddings via fastembed (bge-small by default)."""

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5") -> None:
        from fastembed import TextEmbedding

        self.model = TextEmbedding(model_name=model_name)
        self.name = model_name
        self.dim = len(next(iter(self.model.embed(["dimension probe"]))))

    def embed(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        vecs = np.array(list(self.model.embed(texts)), dtype=np.float32)
        # normalize for cosine similarity via dot product
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return vecs / norms


def build_embedder(model_name: str):
    """Try the real embedder; gracefully fall back so the app never hard-fails."""
    try:
        return FastEmbedEmbedder(model_name)
    except Exception as exc:  # pragma: no cover - environment dependent
        print(f"[embeddings] fastembed unavailable ({exc}); using hashing fallback.")
        return HashingEmbedder()
