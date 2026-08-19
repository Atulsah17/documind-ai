"""Agent tools. Each tool has an OpenAI-style JSON schema + a Python impl."""
from __future__ import annotations

import ast
import json
import operator as op

from ..rag.pipeline import RagPipeline

# ── safe calculator (no eval) ────────────────────────────────
_OPS = {
    ast.Add: op.add, ast.Sub: op.sub, ast.Mult: op.mul, ast.Div: op.truediv,
    ast.Pow: op.pow, ast.USub: op.neg, ast.Mod: op.mod,
}


def _safe_eval(node):
    if isinstance(node, ast.Num):
        return node.n
    if isinstance(node, ast.BinOp):
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp):
        return _OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError("Unsupported expression")


class ToolRegistry:
    """Binds tool implementations to a specific RAG pipeline instance."""

    def __init__(self, pipeline: RagPipeline) -> None:
        self.pipeline = pipeline

    # -- schemas advertised to the LLM --
    def schemas(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "doc_search",
                    "description": "Semantic search over the user's uploaded documents. "
                                   "Use this to answer any question about document content.",
                    "parameters": {
                        "type": "object",
                        "properties": {"query": {"type": "string", "description": "search query"}},
                        "required": ["query"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "calculator",
                    "description": "Evaluate a basic arithmetic expression (+ - * / ** %).",
                    "parameters": {
                        "type": "object",
                        "properties": {"expression": {"type": "string"}},
                        "required": ["expression"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "list_documents",
                    "description": "List the documents currently available to search.",
                    "parameters": {"type": "object", "properties": {}},
                },
            },
        ]

    # -- implementations --
    def call(self, name: str, args: dict) -> str:
        if name == "doc_search":
            hits = self.pipeline.retrieve(args["query"], k=args.get("k"))
            return json.dumps({
                "results": [
                    {"doc_id": h.doc_id, "filename": h.filename, "chunk_index": h.chunk_index,
                     "score": round(h.score, 4), "snippet": h.text}
                    for h in hits
                ]
            })
        if name == "calculator":
            try:
                value = _safe_eval(ast.parse(args["expression"], mode="eval").body)
                return json.dumps({"result": value})
            except Exception as exc:
                return json.dumps({"error": f"could not evaluate: {exc}"})
        if name == "list_documents":
            return json.dumps({"documents": self.pipeline.documents()})
        return json.dumps({"error": f"unknown tool: {name}"})
