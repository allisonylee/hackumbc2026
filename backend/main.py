"""FastAPI app: POST /api/chat (NDJSON stream, CONTRACTS.md "Chat API") and GET /api/health.

Run from backend/: uvicorn main:app --reload
"""

import asyncio
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

from cache import Answer, AnswerCache, tokens_of
from cache import key as cache_key_of
from config import MAX_CHARS, MAX_MESSAGES, Settings
from energy import EnergyMeter, round_wh
from llm import OllamaError, Usage, build_messages, stream_answer
from rag import Index, format_sources, retrieve, search_query
from router import Router
from tools import AppData

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
    data: "AppData | None | object" = _UNSET,
    meter: EnergyMeter | None = None,
    cache: AnswerCache | None = None,
) -> FastAPI:
    """Tests can swap in a fake Ollama (`transport`), a corpus (`index`), app data (`data`; None disables each)
    an energy meter and an answer cache."""
    settings = settings or Settings()
    corpus = Index.load(settings) if index is _UNSET else index
    app_data = AppData.load() if data is _UNSET else data
    router = Router(app_data, corpus.lowercase_words() if corpus else set())
    meter = meter or EnergyMeter(settings)
    answers = cache if cache is not None else AnswerCache()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        timeout = httpx.Timeout(connect=5, read=120, write=10, pool=5)
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            app.state.ollama = client
            baseline = None
            if meter.monitor is not None:
                await meter.sample_baseline()
                log.info("energy: measuring with zeus-apple-silicon, idle baseline %.2f W", meter.baseline_w)
                baseline = asyncio.create_task(meter.keep_baseline())
            yield
            if baseline:
                baseline.cancel()

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
        return {"model": settings.model, "provider": "ollama", "region": settings.region,
                "energy": "measured" if meter.measuring else "estimated"}

    @app.post("/api/chat")
    @limiter.limit(settings.rate_limit)
    async def chat(request: Request, body: ChatRequest):
        history = [m.model_dump() for m in body.messages]
        context = body.context.model_dump() if body.context else None
        client = request.app.state.ollama
        cache_key = cache_key_of(history, context)

        async def events() -> AsyncIterator[bytes]:
            hit = answers.get(cache_key)
            if hit is not None:
                yield line({"type": "sources", "items": hit.sources})
                for t in tokens_of(hit.text):
                    yield line({"type": "token", "text": t})
                yield line({"type": "done", "tokens": hit.tokens, "energyWh": 0, "measured": False, "cached": True})
                return

            handle = meter.start()
            finished = False
            items, text = [], []
            try:
                async for ev in answer():
                    if isinstance(ev, Usage):
                        reading = meter.finish(handle, ev.tokens, ev.seconds)
                        finished = True
                        answers.put(cache_key, Answer(items, "".join(text), ev.tokens))
                        yield line({"type": "done", "tokens": ev.tokens, "energyWh": round_wh(reading.wh),
                                    "measured": reading.measured, "cached": False})
                        continue
                    if ev["type"] == "sources":
                        items = ev["items"]
                    elif ev["type"] == "token":
                        text.append(ev["text"])
                    yield line(ev)
            finally:
                if not finished:  # error, or the client went away mid-answer
                    meter.cancel(handle)

        async def answer() -> AsyncIterator[dict | Usage]:
            route = router.route(history[-1]["content"], context)
            query = f"{search_query(history)} {route.extra_query}".strip()
            k = max(2, 4 - len(route.facts))  # keep the prompt small for the 2B model
            hits = await retrieve(corpus, client, settings, query, k)
            items, sources = format_sources(hits, route.facts, settings.app_url)
            yield {"type": "sources", "items": items}
            try:
                async for part in stream_answer(client, settings, build_messages(history, sources)):
                    yield part if isinstance(part, Usage) else {"type": "token", "text": part}
            except OllamaError as e:
                log.error("chat failed: %s", e)
                yield {"type": "error", "message": "The guide is offline right now."}

        return StreamingResponse(
            events(),
            media_type="application/x-ndjson",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


app = create_app()
