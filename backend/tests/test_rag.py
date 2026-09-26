import json

import httpx
import numpy as np
from fastapi.testclient import TestClient

from config import Settings
from main import create_app
from rag import SIM_FLOOR, SIM_MIN, Index, format_sources, search_query, tokens

CHUNKS = [
    {"id": "a#0", "doc": "a", "title": "How trees cool streets", "url": "https://a.test", "source": "A",
     "text": "Shade and evapotranspiration cool the air."},
    {"id": "b#0", "doc": "b", "title": "Code Red", "url": "https://b.test", "source": "B",
     "text": "Broadway East is one of the hottest neighborhoods, with little canopy."},
    {"id": "b#1", "doc": "b", "title": "Code Red", "url": "https://b.test", "source": "B",
     "text": "East Baltimore has more pavement. Broadway East residents lack shade."},
    {"id": "c#0", "doc": "c", "title": "Volunteer with trees", "url": "https://c.test", "source": "C",
     "text": "Plant and water trees with local groups."},
]
# 2-d toy embeddings: axis 0 = "cooling", axis 1 = "helping"
VECS = np.array([[1, 0], [0.6, 0.8], [0.6, 0.8], [0, 1]], dtype=np.float32)
VECS /= np.linalg.norm(VECS, axis=1, keepdims=True)


def idx() -> Index:
    return Index(CHUNKS, VECS)


def test_tokens_bigrams_and_stopwords():
    t = tokens("Why is Broadway East so hot?")
    assert "broadway_east" in t and "why" not in t and "is" not in t


def test_semantic_hit():
    hits = idx().search("how do trees cool", np.array([1.0, 0.0]))
    assert hits[0].chunk["id"] == "a#0"


def test_keyword_rescues_weak_semantic_match_for_names():
    q = np.array([0.9, -0.3625])  # cos with doc b ≈ 0.26: above SIM_FLOOR, below SIM_MIN
    hits = idx().search("Broadway East", q / np.linalg.norm(q))
    b = [h for h in hits if h.chunk["doc"] == "b"]
    assert b and SIM_FLOOR <= b[0].cos < SIM_MIN


def test_one_chunk_per_doc():
    hits = idx().search("Broadway East shade", np.array([0.6, 0.8]))
    docs = [h.chunk["doc"] for h in hits]
    assert len(docs) == len(set(docs))


def test_off_topic_returns_nothing():
    assert idx().search("capital of France", np.array([-1.0, 0.0])) == []


def test_keyword_only_fallback_when_embedding_down():
    hits = idx().search("Broadway East", None)
    assert hits and hits[0].chunk["doc"] == "b"


def test_search_query_joins_short_follow_up():
    h = [{"role": "user", "content": "Which tree fits a narrow sidewalk?"},
         {"role": "assistant", "content": "A redbud [1]."},
         {"role": "user", "content": "what about oaks?"}]
    assert search_query(h) == "Which tree fits a narrow sidewalk? what about oaks?"


def test_format_sources_numbers_items_and_block():
    hits = idx().search("how do trees cool", np.array([1.0, 0.0]), k=1)
    items, block = format_sources(hits)
    assert items == [{"n": 1, "title": "How trees cool streets", "url": "https://a.test"}]
    assert block.startswith("SOURCES:\n[1] How trees cool streets (A)\nShade")
    assert format_sources([]) == ([], "")


def test_index_load_matches_real_corpus():
    real = Index.load(Settings())
    assert real is not None and real.vectors.shape[0] == len(real.chunks)


def test_chat_sends_sources_and_puts_them_in_prompt():
    seen = []

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content)
        if req.url.path == "/api/embed":
            return httpx.Response(200, json={"embeddings": [[1.0, 0.0]]})
        seen.append(body)
        done = {"message": {"content": "Shade [1]."}, "done": True, "eval_count": 3}
        return httpx.Response(200, content=(json.dumps(done) + "\n").encode())

    app = create_app(Settings(), transport=httpx.MockTransport(handler), index=idx())
    with TestClient(app) as c:
        res = c.post("/api/chat", json={"messages": [{"role": "user", "content": "How do trees cool?"}]})
    ev = [json.loads(l) for l in res.text.splitlines()]
    assert ev[0]["type"] == "sources" and ev[0]["items"][0]["url"] == "https://a.test"
    assert "SOURCES:\n[1] How trees cool streets" in seen[0]["messages"][-1]["content"]
    assert seen[0]["options"]["num_ctx"] == 8192
