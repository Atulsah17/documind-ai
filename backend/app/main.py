"""FastAPI entrypoint — upload, agentic chat (SSE streaming), documents, health."""
from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .agent.agent import Agent
from .config import settings
from .rag.loaders import SUPPORTED_EXTENSIONS
from .rag.pipeline import RagPipeline
from .schemas import ChatRequest, DocumentInfo, HealthResponse

app = FastAPI(title="DocuMind AI", version="1.0.0",
              description="Agentic RAG document-intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = RagPipeline()

_SAMPLE = (
    "Acme Inc. — Remote Work Policy (Sample Document)\n\n"
    "Purpose: This policy outlines how employees at Acme Inc. can work remotely while staying "
    "productive and connected.\n\n"
    "Eligibility: All full-time employees who have completed their probation period are eligible "
    "to work remotely up to three days per week, subject to manager approval.\n\n"
    "Core hours: Remote employees must be available between 10:00 and 16:00 for meetings and "
    "collaboration. Outside core hours, schedules are flexible.\n\n"
    "Equipment: The company provides a laptop and a monthly stipend of 50 EUR toward internet "
    "costs. Employees are responsible for maintaining a safe and secure home workspace.\n\n"
    "Security: Employees must use the company VPN, enable disk encryption, and never store "
    "customer data on personal devices.\n\n"
    "Requests and deadlines: To request a remote-work arrangement, submit the form to your "
    "manager at least two weeks in advance. Managers will respond within five business days.\n\n"
    "Review: This policy is reviewed annually by the People team."
)


@app.on_event("startup")
def _seed_sample() -> None:
    try:
        pipeline.ingest("Remote Work Policy (sample).txt", _SAMPLE.encode("utf-8"))
    except Exception as exc:  # pragma: no cover
        print(f"[startup] could not seed sample: {exc}")


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    s = pipeline.stats
    return HealthResponse(status="ok", provider=settings.llm_provider,
                          embedding_model=s["embedding_model"],
                          documents=s["documents"], chunks=s["chunks"])


@app.get("/api/documents", response_model=list[DocumentInfo])
def list_documents() -> list[DocumentInfo]:
    return [DocumentInfo(**d) for d in pipeline.documents()]


@app.get("/api/supported-types")
def supported_types() -> dict:
    return {"extensions": SUPPORTED_EXTENSIONS}


@app.post("/api/upload", response_model=DocumentInfo)
async def upload(file: UploadFile = File(...)) -> DocumentInfo:
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "Empty file.")
    try:
        info = pipeline.ingest(file.filename or "document.txt", raw)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return DocumentInfo(**info)


@app.post("/api/upload-batch")
async def upload_batch(files: list[UploadFile] = File(...)) -> dict:
    """Ingest multiple documents at once; report per-file success/failure."""
    uploaded, failed = [], []
    for f in files:
        try:
            raw = await f.read()
            if not raw:
                raise ValueError("empty file")
            uploaded.append(pipeline.ingest(f.filename or "document.txt", raw))
        except Exception as exc:  # keep going even if one file fails
            failed.append({"filename": f.filename, "error": str(exc)})
    return {"uploaded": uploaded, "failed": failed}


@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str) -> dict:
    if not pipeline.delete(doc_id):
        raise HTTPException(404, "Document not found.")
    return {"deleted": doc_id}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    """Stream the agent run as Server-Sent Events."""
    if not req.message.strip():
        raise HTTPException(400, "Empty message.")

    async def event_stream():
        agent = Agent(pipeline)
        # agent.run is sync + CPU-light; run in a thread to keep the loop free
        result = await asyncio.to_thread(agent.run, req.message)

        for step in result.trace:
            yield {"event": "trace",
                   "data": json.dumps({"type": step.type, "name": step.name, "detail": step.detail})}
            await asyncio.sleep(0.04)  # brief pause so the UI can animate each step

        # stream a few words per frame so the answer appears quickly (not word-by-word crawl)
        words = result.answer.split(" ")
        for i in range(0, len(words), 4):
            chunk = " ".join(words[i:i + 4])
            yield {"event": "token", "data": json.dumps({"content": chunk + " "})}
            await asyncio.sleep(0.012)

        # dedupe sources by (filename, chunk_index)
        seen, sources = set(), []
        for s in result.sources:
            key = (s["filename"], s["chunk_index"])
            if key not in seen:
                seen.add(key)
                sources.append(s)
        yield {"event": "sources", "data": json.dumps({"sources": sources})}
        yield {"event": "done", "data": "{}"}

    return EventSourceResponse(event_stream())
