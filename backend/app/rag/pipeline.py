"""RAG pipeline: ingest documents → chunk → embed → store, and retrieve."""
from __future__ import annotations

import uuid
from dataclasses import dataclass

from ..config import settings
from .chunking import chunk_text
from .embeddings import build_embedder
from .loaders import extract_text
from .vectorstore import Record, VectorStore
from .vision import mime_for, transcribe_image, transcribe_scanned_pdf

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


@dataclass
class RetrievedChunk:
    doc_id: str
    filename: str
    chunk_index: int
    text: str
    score: float


class RagPipeline:
    def __init__(self) -> None:
        self.embedder = build_embedder(settings.embedding_model)
        self.store = VectorStore(dim=getattr(self.embedder, "dim", 384))
        self._filenames: dict[str, str] = {}
        self._chunk_counts: dict[str, int] = {}

    # ── ingestion ────────────────────────────────────────────
    def _read_document(self, filename: str, raw: bytes) -> str:
        ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
        if ext in IMAGE_EXTS:
            text = transcribe_image(raw, mime_for(ext))
            return text or f"[Image: {filename} — no readable text found]"
        text = extract_text(filename, raw)
        # Scanned/image-only PDF → little/no text layer; try vision OCR.
        if ext == ".pdf" and len(text.strip()) < 40:
            ocr = transcribe_scanned_pdf(raw)
            if ocr.strip():
                return ocr
        return text

    def ingest(self, filename: str, raw: bytes) -> dict:
        text = self._read_document(filename, raw)
        chunks = chunk_text(text, settings.chunk_size, settings.chunk_overlap)
        if not chunks:
            raise ValueError("No extractable text found in document.")
        doc_id = uuid.uuid4().hex[:12]
        vectors = self.embedder.embed(chunks)
        records = [
            Record(doc_id=doc_id, filename=filename, chunk_index=i, text=c)
            for i, c in enumerate(chunks)
        ]
        self.store.add(vectors, records)
        self._filenames[doc_id] = filename
        self._chunk_counts[doc_id] = len(chunks)
        return {"doc_id": doc_id, "filename": filename, "chunks": len(chunks)}

    # ── retrieval ────────────────────────────────────────────
    def retrieve(self, query: str, k: int | None = None) -> list[RetrievedChunk]:
        k = k or settings.top_k
        qvec = self.embedder.embed([query])[0]
        hits = self.store.search(qvec, k=k)
        return [
            RetrievedChunk(r.doc_id, r.filename, r.chunk_index, r.text, score)
            for r, score in hits
        ]

    def document_text(self, doc_id: str, max_chars: int = 4000) -> str:
        """Concatenated text of a single document (for summaries/insights)."""
        parts = [r.text for r in self.store._records if r.doc_id == doc_id]
        return "\n\n".join(parts)[:max_chars]

    # ── bookkeeping ──────────────────────────────────────────
    def documents(self) -> list[dict]:
        return [
            {"doc_id": d, "filename": self._filenames[d], "chunks": self._chunk_counts[d]}
            for d in self.store.doc_ids()
        ]

    def delete(self, doc_id: str) -> bool:
        removed = self.store.remove_doc(doc_id)
        self._filenames.pop(doc_id, None)
        self._chunk_counts.pop(doc_id, None)
        return removed > 0

    @property
    def stats(self) -> dict:
        return {
            "documents": len(self.store.doc_ids()),
            "chunks": self.store.size,
            "embedding_model": getattr(self.embedder, "name", "unknown"),
        }
