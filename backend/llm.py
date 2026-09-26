"""Prompt building and the streaming Ollama call (plan §10.4)."""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from config import Settings

SYSTEM_PROMPT = """You are Canopy Guide, an educator for a Baltimore tree-planting app.
Use ONLY the FACTS and numbered SOURCES in the user's message. Cite sources like [1] right after the claim they support.
Numbers must come from the FACTS or SOURCES; never invent them.
If they don't cover the question, say you don't know and suggest where to look.
Answer in at most 120 words, in warm, plain language.

Example of the format:
SOURCES:
[1] Street trees and heat: Tree crowns shade pavement and walls, and leaves release water vapor that cools the air around them.
QUESTION: How do trees cool a street?
ANSWER: Trees cool a street in two ways. Their crowns shade pavement and walls so they soak up less sun, and their leaves release water vapor that cools the surrounding air [1]."""

NO_CONTEXT = "(no FACTS or SOURCES matched this question)"


class OllamaError(RuntimeError):
    pass


@dataclass
class Usage:
    tokens: int  # generated tokens (Ollama eval_count)
    prompt_tokens: int
    seconds: float  # generation time reported by Ollama


def build_messages(history: list[dict], context: str = "") -> list[dict]:
    """System prompt, then the conversation; the newest user turn is wrapped with the retrieved context."""
    *earlier, last = history
    wrapped = f"{context.strip() or NO_CONTEXT}\n\nQUESTION: {last['content']}"
    return [{"role": "system", "content": SYSTEM_PROMPT}, *earlier, {"role": "user", "content": wrapped}]


async def stream_answer(
    client: httpx.AsyncClient, settings: Settings, messages: list[dict]
) -> AsyncIterator[str | Usage]:
    """Yields token strings as they arrive, then one Usage. Raises OllamaError on failure."""
    body = {
        "model": settings.model,
        "messages": messages,
        "stream": True,
        "think": False,
        "keep_alive": settings.keep_alive,
        "options": {"num_predict": settings.num_predict, "temperature": settings.temperature},
    }
    try:
        async with client.stream("POST", f"{settings.ollama_url}/api/chat", json=body) as res:
            if res.status_code != 200:
                detail = (await res.aread()).decode(errors="replace")[:300]
                raise OllamaError(f"Ollama returned HTTP {res.status_code}: {detail}")
            async for line in res.aiter_lines():
                if not line.strip():
                    continue
                chunk = json.loads(line)
                if "error" in chunk:
                    raise OllamaError(str(chunk["error"]))
                text = chunk.get("message", {}).get("content", "")
                if text:
                    yield text
                if chunk.get("done"):
                    yield Usage(
                        tokens=int(chunk.get("eval_count", 0)),
                        prompt_tokens=int(chunk.get("prompt_eval_count", 0)),
                        seconds=chunk.get("eval_duration", 0) / 1e9,
                    )
                    return
    except httpx.HTTPError as e:
        raise OllamaError(f"Can't reach Ollama at {settings.ollama_url}: {e}") from e
    raise OllamaError("Ollama stream ended without a final message")
