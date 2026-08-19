"""Provider-agnostic chat LLM with tool-calling.

Supported providers (OpenAI-compatible /chat/completions):
  • openai  • azure  • groq
Plus a deterministic **mock** provider that emulates tool-calling so the whole
agent works with zero API keys (used for demos and CI).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import requests

from ..config import settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict
    extra: dict | None = None  # provider-specific fields to echo back (e.g. Gemini thought_signature)


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


# ─────────────────────────── real providers ───────────────────────────
class OpenAICompatibleLLM:
    def __init__(self, base_url: str, api_key: str, model: str, extra_headers: dict | None = None):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.headers = {"Content-Type": "application/json", **(extra_headers or {})}
        if api_key and "api-key" not in self.headers:
            self.headers["Authorization"] = f"Bearer {api_key}"

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse:
        payload: dict = {"model": self.model, "messages": messages, "temperature": 0.2}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        resp = requests.post(
            f"{self.base_url}/chat/completions", headers=self.headers, json=payload, timeout=60
        )
        resp.raise_for_status()
        msg = resp.json()["choices"][0]["message"]
        calls = [
            ToolCall(id=tc["id"], name=tc["function"]["name"],
                     arguments=json.loads(tc["function"]["arguments"] or "{}"),
                     extra=tc.get("extra_content"))
            for tc in msg.get("tool_calls", []) or []
        ]
        return LLMResponse(content=msg.get("content"), tool_calls=calls)


# ─────────────────────────── mock provider ───────────────────────────
_QUESTION_HINTS = ("what", "why", "how", "when", "who", "where", "which", "summar",
                   "explain", "list", "describe", "?")
_ARITH = re.compile(r"^\s*[-+*/(). \d]+\s*$")


class MockLLM:
    """Emulates an agent: routes to doc_search / calculator, then synthesizes."""

    name = "mock"

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse:
        already_used_tool = any(m.get("role") == "tool" for m in messages)
        user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")

        if not already_used_tool and tools:
            math = re.search(r"[-+*/]\s*\d", user_msg)
            if math and _ARITH.match(re.sub(r"[^-+*/(). \d]", "", user_msg) or ""):
                expr = re.sub(r"[^-+*/(). \d]", "", user_msg)
                return LLMResponse(tool_calls=[ToolCall("call_calc", "calculator", {"expression": expr})])
            if any(h in user_msg.lower() for h in _QUESTION_HINTS) or len(user_msg.split()) > 2:
                return LLMResponse(tool_calls=[ToolCall("call_search", "doc_search", {"query": user_msg})])

        # Synthesize a final answer from the most recent tool output.
        tool_out = next((m["content"] for m in reversed(messages) if m.get("role") == "tool"), "")
        try:
            parsed = json.loads(tool_out)
        except Exception:
            parsed = None

        if isinstance(parsed, dict) and parsed.get("results"):
            top = parsed["results"][0]
            snippet = top["snippet"].strip().replace("\n", " ")
            snippet = (snippet[:400] + "…") if len(snippet) > 400 else snippet
            answer = (
                f"Based on the retrieved context, here's what the documents say about "
                f'"{user_msg.strip()}":\n\n{snippet}\n\n'
                f"(Source: {top['filename']}, chunk {top['chunk_index']}.)"
            )
            return LLMResponse(content=answer)
        if isinstance(parsed, dict) and "result" in parsed:  # calculator
            return LLMResponse(content=f"The result is **{parsed['result']}**.")
        if tool_out:
            return LLMResponse(content=tool_out)
        return LLMResponse(content=(
            "I couldn't find anything in the uploaded documents for that. "
            "Try uploading a document or rephrasing your question."
        ))


def build_llm():
    p = settings.llm_provider.lower()
    if p == "openai":
        return OpenAICompatibleLLM("https://api.openai.com/v1", settings.openai_api_key, settings.openai_model)
    if p == "groq":
        return OpenAICompatibleLLM("https://api.groq.com/openai/v1", settings.groq_api_key, settings.groq_model)
    if p == "gemini":
        # Google's OpenAI-compatible endpoint (supports chat + tool-calling)
        return OpenAICompatibleLLM(
            "https://generativelanguage.googleapis.com/v1beta/openai",
            settings.gemini_api_key, settings.gemini_model,
        )
    if p == "azure":
        base = f"{settings.azure_openai_endpoint}/openai/deployments/{settings.azure_openai_deployment}"
        llm = OpenAICompatibleLLM(base, "", settings.azure_openai_deployment,
                                  extra_headers={"api-key": settings.azure_openai_api_key})
        # Azure needs api-version as a query param; patch the URL used in chat()
        llm.base_url = f"{base}?api-version={settings.azure_openai_api_version}".replace(
            "/chat/completions", ""
        )
        llm._azure_version = settings.azure_openai_api_version  # type: ignore[attr-defined]
        return _AzureLLM(base, settings.azure_openai_api_key, settings.azure_openai_deployment,
                         settings.azure_openai_api_version)
    return MockLLM()


class _AzureLLM(OpenAICompatibleLLM):
    def __init__(self, base: str, api_key: str, model: str, api_version: str):
        super().__init__(base, "", model, extra_headers={"api-key": api_key})
        self._api_version = api_version

    def chat(self, messages, tools=None):
        payload: dict = {"messages": messages, "temperature": 0.2}
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        url = f"{self.base_url}/chat/completions?api-version={self._api_version}"
        resp = requests.post(url, headers=self.headers, json=payload, timeout=60)
        resp.raise_for_status()
        msg = resp.json()["choices"][0]["message"]
        calls = [
            ToolCall(id=tc["id"], name=tc["function"]["name"],
                     arguments=json.loads(tc["function"]["arguments"] or "{}"),
                     extra=tc.get("extra_content"))
            for tc in msg.get("tool_calls", []) or []
        ]
        return LLMResponse(content=msg.get("content"), tool_calls=calls)
