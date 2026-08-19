"""Word-based chunking with overlap. Deterministic and dependency-free."""
from __future__ import annotations

import re


def _normalize(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    # collapse excessive whitespace but keep paragraph breaks
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """Split text into ~chunk_size-word chunks with `overlap` words of context.

    Args:
        text: raw document text.
        chunk_size: target words per chunk.
        overlap: words shared between consecutive chunks (context continuity).
    """
    text = _normalize(text)
    if not text:
        return []
    words = text.split(" ")
    if len(words) <= chunk_size:
        return [text]

    step = max(1, chunk_size - overlap)
    chunks: list[str] = []
    for start in range(0, len(words), step):
        window = words[start : start + chunk_size]
        if not window:
            break
        chunks.append(" ".join(window).strip())
        if start + chunk_size >= len(words):
            break
    return chunks
