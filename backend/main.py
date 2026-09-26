"""FastAPI app: POST /api/chat (NDJSON stream, CONTRACTS.md "Chat API") and GET /api/health.

Run from backend/: uvicorn main:app --reload
"""

import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config import MAX_CHARS, MAX_MESSAGES, Settings
from energy import estimate_wh
from llm import OllamaError, Usage, build_messages, stream_answer
from rag import Index, format_sources, retrieve, search_query

log = logging.getLogger("canopy")


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_CHARS)


class SiteContext(BaseModel):
    """Sent by the Plan tab's site popup (web/src/store.ts ChatContext)."""

    model_config = ConfigDict(extra="ignore")
    id: str
    nb: str
    species: str
    cost: float
    space: str | None = None
    rank: int | None = None
    shap: list[tuple[str, float]] | None = None


class ChatContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nb: str | None = None
    site: SiteContext | None = None


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=MAX_MESSAGES)
    mode: Literal["learn"] | None = None
    context: ChatContext | None = None

    @field_validator("messages")
    @classmethod
    def ends_with_user(cls, v: list[Message]) -> list[Message]:
        if v[-1].role != "user":
            raise ValueError("the last message must be from the user")
        return v


def line(obj: dict) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode()


_UNSET = object()


def create_app(
    settings: Settings | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    index: "Index | None | object" = _UNSET,
) -> FastAPI:
    """`transport` lets tests swap in a fake Ollama; `index` a corpus (None = no sources)."""
    settings = settings or Settings()
    corpus = Index.load(settings) if index is _UNSET else index

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        timeout = httpx.Timeout(connect=5, read=120, write=10, pool=5)
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            app.state.ollama = client
            yield

    app = FastAPI(title="Canopy Guide API", lifespan=lifespan)
    limiter = Limiter(key_func=get_remote_address)
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )

    @app.get("/api/health")
    def health():
        return {"model": settings.model, "provider": "ollama", "region": settings.region}

    @app.post("/api/chat")
    @limiter.limit(settings.rate_limit)
    async def chat(request: Request, body: ChatRequest):
        history = [m.model_dump() for m in body.messages]
        client = request.app.state.ollama

        async def events() -> AsyncIterator[bytes]:
            # Routing to neighborhood/site facts arrives in step 4.
            hits = await retrieve(corpus, client, settings, search_query(history))
            items, sources = format_sources(hits)
            messages = build_messages(history, sources)
            yield line({"type": "sources", "items": items})
            try:
                async for part in stream_answer(client, settings, messages):
                    if isinstance(part, Usage):
                        yield line({
                            "type": "done",
                            "tokens": part.tokens,
                            "energyWh": round(estimate_wh(part.tokens, settings.j_per_token), 4),
                            "measured": False,
                            "cached": False,
                        })
                    else:
                        yield line({"type": "token", "text": part})
            except OllamaError as e:
                log.error("chat failed: %s", e)
                yield line({"type": "error", "message": "The guide is offline right now."})

        return StreamingResponse(
            events(),
            media_type="application/x-ndjson",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


app = create_app()
