"""Retrieval evaluation: hit-rate & MRR over a seed question set.

Run:  python -m eval.evaluate
Matches the 'LLM/RAG evaluation' keyword on the résumé — measures whether the
retriever surfaces the passage containing the ground-truth answer.
"""
from __future__ import annotations

from app.rag.pipeline import RagPipeline

CORPUS = {
    "kubernetes.txt": (
        "Kubernetes automates deployment, scaling and management of containers. "
        "A pod is the smallest deployable unit in Kubernetes. "
        "A Service provides a stable network endpoint for a set of pods. "
        "Horizontal Pod Autoscaler scales pods based on CPU or custom metrics."
    ),
    "rag.txt": (
        "Retrieval-Augmented Generation grounds an LLM in retrieved documents. "
        "Embeddings map text to vectors so semantic search can find relevant chunks. "
        "Chunk overlap preserves context across chunk boundaries. "
        "Re-ranking improves the ordering of retrieved passages."
    ),
}

# (question, expected keyword that must appear in a retrieved chunk)
QUESTIONS = [
    ("What is the smallest deployable unit in Kubernetes?", "pod"),
    ("How does Kubernetes scale pods automatically?", "autoscaler"),
    ("What gives pods a stable network endpoint?", "service"),
    ("What does RAG use to find relevant chunks?", "embeddings"),
    ("Why is chunk overlap used?", "overlap"),
    ("What improves the ordering of retrieved passages?", "re-ranking"),
]


def evaluate(top_k: int = 3) -> dict:
    p = RagPipeline()
    for name, text in CORPUS.items():
        p.ingest(name, text.encode())

    hits, reciprocal = 0, 0.0
    for question, keyword in QUESTIONS:
        retrieved = p.retrieve(question, k=top_k)
        rank = next((i + 1 for i, h in enumerate(retrieved)
                     if keyword.lower() in h.text.lower()), 0)
        if rank:
            hits += 1
            reciprocal += 1.0 / rank

    n = len(QUESTIONS)
    return {"questions": n, "hit_rate@%d" % top_k: round(hits / n, 3),
            "mrr": round(reciprocal / n, 3)}


if __name__ == "__main__":
    metrics = evaluate()
    print("RAG retrieval evaluation")
    print("─" * 32)
    for k, v in metrics.items():
        print(f"{k:>14}: {v}")
