"""The agent loop: reason → call tools → observe → answer.

Emits a structured trace (each tool call + result) so the UI can show the
agent 'thinking'. Provider-agnostic: works with real LLMs or the mock.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field

from ..rag.pipeline import RagPipeline
from .llm import build_llm
from .tools import ToolRegistry

SYSTEM_PROMPT = (
    "You are DocuMind, an agentic document-intelligence assistant. "
    "For any question about document content, call doc_search ONCE with a focused "
    "query, then answer directly from the results and cite the source filename. "
    "Do NOT call list_documents unless the user explicitly asks which documents exist. "
    "Use calculator only for arithmetic. Be concise and accurate. If the documents do "
    "not contain the answer, clearly say you couldn't find it in the uploaded documents "
    "rather than guessing — never invent facts."
)


@dataclass
class TraceStep:
    type: str            # "tool_call" | "tool_result"
    name: str
    detail: str


@dataclass
class AgentResult:
    answer: str
    trace: list[TraceStep] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)


class Agent:
    def __init__(self, pipeline: RagPipeline, max_iters: int = 4) -> None:
        self.pipeline = pipeline
        self.tools = ToolRegistry(pipeline)
        self.llm = build_llm()
        self.max_iters = max_iters

    def run(self, user_message: str) -> AgentResult:
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]
        trace: list[TraceStep] = []
        sources: list[dict] = []

        for _ in range(self.max_iters):
            resp = self.llm.chat(messages, tools=self.tools.schemas())

            if not resp.tool_calls:
                return AgentResult(answer=resp.content or "", trace=trace, sources=sources)

            # record the assistant's tool-call turn.
            # content must be null (not "") alongside tool_calls for Gemini/OpenAI-compat.
            messages.append({
                "role": "assistant",
                "content": resp.content if resp.content else None,
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                     **({"extra_content": tc.extra} if tc.extra else {})}
                    for tc in resp.tool_calls
                ],
            })

            for tc in resp.tool_calls:
                trace.append(TraceStep("tool_call", tc.name,
                                       json.dumps(tc.arguments, ensure_ascii=False)))
                result = self.tools.call(tc.name, tc.arguments)
                trace.append(TraceStep("tool_result", tc.name, _short(result)))

                if tc.name == "doc_search":
                    try:
                        for r in json.loads(result).get("results", []):
                            sources.append(r)
                    except Exception:
                        pass

                messages.append({
                    "role": "tool", "tool_call_id": tc.id, "name": tc.name, "content": result,
                })

        # ran out of iterations — ask for a final synthesis with no tools
        final = self.llm.chat(messages + [{"role": "user",
                 "content": "Give your final answer now using the information above."}])
        return AgentResult(answer=final.content or "I wasn't able to complete that.",
                           trace=trace, sources=sources)


def _short(text: str, limit: int = 240) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"
