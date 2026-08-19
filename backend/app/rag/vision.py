"""Vision extraction for images and scanned PDFs via a multimodal LLM.

Uses the configured provider's OpenAI-compatible vision endpoint (Gemini / OpenAI
/ Azure). Returns "" when the provider isn't vision-capable (e.g. mock), so
ingestion degrades gracefully instead of failing.
"""
from __future__ import annotations

import base64

from ..config import settings

_VISION_PROVIDERS = {"gemini", "openai", "azure"}
_IMAGE_MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "gif": "image/gif", "bmp": "image/bmp",
}
_PROMPT = (
    "Transcribe ALL text in this image verbatim, preserving structure. "
    "If it contains tables, render them as readable rows. Briefly note any figures "
    "or handwriting. Output plain text only — no commentary."
)


def vision_capable() -> bool:
    return settings.llm_provider.lower() in _VISION_PROVIDERS


def mime_for(ext: str) -> str:
    return _IMAGE_MIME.get(ext.lstrip(".").lower(), "image/png")


def _describe(image_bytes: bytes, mime: str) -> str:
    from ..agent.llm import build_llm

    b64 = base64.b64encode(image_bytes).decode()
    msg = [{"role": "user", "content": [
        {"type": "text", "text": _PROMPT},
        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
    ]}]
    try:
        return (build_llm().chat(msg).content or "").strip()
    except Exception as exc:  # network / provider error → let caller fall back
        print(f"[vision] transcription failed: {exc}")
        return ""


def transcribe_image(image_bytes: bytes, mime: str) -> str:
    if not vision_capable():
        return ""
    return _describe(image_bytes, mime)


def transcribe_scanned_pdf(pdf_bytes: bytes, max_pages: int = 3) -> str:
    """Render PDF pages to images (PyMuPDF) and transcribe with vision."""
    if not vision_capable():
        return ""
    try:
        import fitz  # PyMuPDF
    except Exception:
        return ""
    out: list[str] = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(dpi=120)
            text = _describe(pix.tobytes("png"), "image/png")
            if text:
                out.append(f"# Page {i + 1}\n{text}")
    except Exception as exc:
        print(f"[vision] scanned-pdf render failed: {exc}")
        return ""
    return "\n\n".join(out)
