"""embeddinggemma via Ollama's /api/embed, with the model's task prefixes.

Documents and queries use different prefixes (embeddinggemma model card), so both the
build script and query-time search go through here.
"""

import httpx
import numpy as np

from config import Settings


def doc_text(title: str, text: str) -> str:
    return f"title: {title or 'none'} | text: {text}"


def query_text(q: str) -> str:
    return f"task: search result | query: {q}"


def _normalize(vectors: list[list[float]]) -> np.ndarray:
    v = np.asarray(vectors, dtype=np.float32)
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


def _parse(res: httpx.Response, n: int) -> np.ndarray:
    if res.status_code != 200:
        raise RuntimeError(f"Ollama embed returned HTTP {res.status_code}: {res.text[:300]}")
    vecs = res.json().get("embeddings") or []
    if len(vecs) != n:
        raise RuntimeError(f"expected {n} embeddings, got {len(vecs)}")
    return _normalize(vecs)


def embed_sync(client: httpx.Client, settings: Settings, texts: list[str]) -> np.ndarray:
    """Unit-length float32 vectors, one row per text."""
    res = client.post(f"{settings.ollama_url}/api/embed", json={"model": settings.embed_model, "input": texts})
    return _parse(res, len(texts))


async def embed(client: httpx.AsyncClient, settings: Settings, texts: list[str]) -> np.ndarray:
    res = await client.post(
        f"{settings.ollama_url}/api/embed",
        json={"model": settings.embed_model, "input": texts, "keep_alive": settings.keep_alive},
    )
    return _parse(res, len(texts))
