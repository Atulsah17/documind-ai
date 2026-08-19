"""Unit + integration tests — all run offline (mock LLM, fallback embedder)."""
from app.agent.agent import Agent
from app.rag.chunking import chunk_text
from app.rag.pipeline import RagPipeline

DOC = (
    "Kubernetes is an open-source container orchestration platform. "
    "It automates deployment, scaling, and management of containerized applications. "
    "A pod is the smallest deployable unit. Services expose pods to the network. "
) * 30


def test_chunking_overlap():
    overlap = 10
    chunks = chunk_text(DOC, chunk_size=50, overlap=overlap)
    assert len(chunks) > 1
    # the last `overlap` words of a chunk are the first `overlap` words of the next
    assert chunks[0].split()[-overlap:] == chunks[1].split()[:overlap]


def test_chunking_short_text():
    assert chunk_text("hello world", 800, 120) == ["hello world"]


def test_ingest_and_retrieve():
    p = RagPipeline()
    info = p.ingest("k8s.txt", DOC.encode())
    assert info["chunks"] >= 1
    hits = p.retrieve("What is the smallest deployable unit?", k=3)
    assert hits and any("pod" in h.text.lower() for h in hits)


def test_delete_document():
    p = RagPipeline()
    info = p.ingest("k8s.txt", DOC.encode())
    assert p.stats["documents"] == 1
    assert p.delete(info["doc_id"]) is True
    assert p.stats["documents"] == 0


def test_agent_answers_with_sources():
    p = RagPipeline()
    p.ingest("k8s.txt", DOC.encode())
    result = Agent(p).run("What is a pod in Kubernetes?")
    assert result.answer.strip()
    assert any(s.type == "tool_call" and s.name == "doc_search" for s in result.trace)
    assert result.sources  # grounded answer


def test_agent_calculator():
    p = RagPipeline()
    result = Agent(p).run("12 * (3 + 4)")
    assert "84" in result.answer
