import json

import httpx
from fastapi.testclient import TestClient

from cache import AnswerCache, key, normalize, tokens_of
from config import Settings
from main import create_app

Q = "Why do trees cool streets?"


def test_normalize_and_key():
    assert normalize("  Why do TREES cool streets?? ") == "why do trees cool streets"
    assert key([{"role": "user", "content": "How can I help?"}], None) == key([{"content": "how can i help"}], {})
    assert key([{"content": "a"}, {"content": "b"}, {"content": "c"}], None) is None  # follow-ups aren't cached
    assert key([{"content": "Why here?"}], {"site": {"id": "1"}}) != key([{"content": "Why here?"}], {"site": {"id": "2"}})


def test_tokens_of_round_trips():
    t = "Trees cool [1].\n\nThey shade."
    assert "".join(tokens_of(t)) == t


def test_only_reviewed_answers_are_served(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps([
        {"question": Q, "sources": [], "text": "Shade.", "tokens": 3, "reviewed": True},
        {"question": "How can I help?", "sources": [], "text": "Volunteer.", "tokens": 2, "reviewed": False},
    ]))
    c = AnswerCache(p)
    assert c.get(key([{"content": Q}], None)).text == "Shade."
    assert c.get(key([{"content": "How can I help?"}], None)) is None


def test_lru_evicts_oldest():
    c = AnswerCache(path=None, size=2)
    from cache import Answer
    for q in "abc":
        c.put(q, Answer([], q, 1))
    assert c.get("a") is None and c.get("c").text == "c"


def calls_counter():
    calls = []

    def handler(req):
        if req.url.path == "/api/embed":
            return httpx.Response(500)
        calls.append(1)
        chunks = [{"message": {"content": "Shade "}, "done": False},
                  {"message": {"content": "cools."}, "done": True, "eval_count": 4}]
        return httpx.Response(200, content="".join(json.dumps(c) + "\n" for c in chunks).encode())

    return calls, httpx.MockTransport(handler)


def test_repeat_question_served_from_cache():
    calls, transport = calls_counter()
    app = create_app(Settings(), transport=transport, index=None, data=None, cache=AnswerCache(path=None))
    with TestClient(app) as c:
        first = [json.loads(l) for l in c.post("/api/chat", json={"messages": [{"role": "user", "content": Q}]}).text.splitlines()]
        again = [json.loads(l) for l in c.post("/api/chat", json={"messages": [{"role": "user", "content": Q.lower()}]}).text.splitlines()]
    assert len(calls) == 1
    assert first[-1]["cached"] is False and again[-1]["cached"] is True and again[-1]["energyWh"] == 0
    assert "".join(e["text"] for e in again if e["type"] == "token") == "Shade cools."
    assert again[-1]["tokens"] == 4


def test_errors_are_not_cached():
    app = create_app(Settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500)), index=None,
                     data=None, cache=AnswerCache(path=None))
    with TestClient(app) as c:
        for _ in range(2):
            ev = [json.loads(l) for l in c.post("/api/chat", json={"messages": [{"role": "user", "content": Q}]}).text.splitlines()]
            assert ev[-1]["type"] == "error"
