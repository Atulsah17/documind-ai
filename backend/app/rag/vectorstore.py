"""In-memory cosine-similarity vector store (FAISS-compatible interface).

Vectors are L2-normalized on insert, so cosine similarity == dot product, which
lets us use a single fast matrix multiply for search.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


@dataclass
class Record:
    doc_id: str
    filename: str
    chunk_index: int
    text: str


@dataclass
class VectorStore:
    dim: int
    _matrix: np.ndarray = field(default_factory=lambda: np.zeros((0, 0), dtype=np.float32))
    _records: list[Record] = field(default_factory=list)

    def add(self, vectors: np.ndarray, records: list[Record]) -> None:
        if vectors.shape[0] == 0:
            return
        if self._matrix.size == 0:
            self._matrix = vectors.astype(np.float32)
        else:
            self._matrix = np.vstack([self._matrix, vectors.astype(np.float32)])
        self._records.extend(records)

    def search(self, query_vec: np.ndarray, k: int = 4) -> list[tuple[Record, float]]:
        if not self._records:
            return []
        q = query_vec.reshape(-1).astype(np.float32)
        scores = self._matrix @ q  # cosine similarity (normalized vectors)
        k = min(k, len(self._records))
        top_idx = np.argpartition(-scores, k - 1)[:k]
        top_idx = top_idx[np.argsort(-scores[top_idx])]
        return [(self._records[i], float(scores[i])) for i in top_idx]

    def remove_doc(self, doc_id: str) -> int:
        keep = [i for i, r in enumerate(self._records) if r.doc_id != doc_id]
        removed = len(self._records) - len(keep)
        if removed:
            self._matrix = self._matrix[keep] if keep else np.zeros((0, self.dim), dtype=np.float32)
            self._records = [self._records[i] for i in keep]
        return removed

    @property
    def size(self) -> int:
        return len(self._records)

    def doc_ids(self) -> list[str]:
        seen: dict[str, None] = {}
        for r in self._records:
            seen.setdefault(r.doc_id, None)
        return list(seen)
