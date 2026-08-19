"""Pydantic request/response models."""
from __future__ import annotations

from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    top_k: int | None = None


class Source(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    score: float
    snippet: str


class DocumentInfo(BaseModel):
    doc_id: str
    filename: str
    chunks: int


class HealthResponse(BaseModel):
    status: str
    provider: str
    embedding_model: str
    documents: int
    chunks: int
