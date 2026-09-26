import json

import httpx
from fastapi.testclient import TestClient

from config import Settings
from main import create_app

Q = {"messages": [{"role": "user", "content": "Why do trees cool streets?"}]}


def fake_ollama(chunks: list[dict], status: int = 200, seen: list | None = None):
    def handler(req: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(json.loads(req.content))
        body = "".join(json.dumps(c) + "\n" for c in chunks)
        return httpx.Response(status, content=body.encode())

    return httpx.MockTransport(handler)


OK = [
    {"message": {"role": "assistant", "content": "Trees "}, "done": False},
    {"message": {"role": "assistant", "content": "shade [1]."}, "done": False},
    {"message": {"role": "assistant", "content": ""}, "done": True, "eval_count": 7, "prompt_eval_count": 90,
     "eval_duration": 250_000_000},
]


def client(transport, index=None, **kw) -> TestClient:
    return TestClient(create_app(Settings(**kw), transport=transport, index=index, data=None))


def events(res) -> list[dict]:
    return [json.loads(l) for l in res.text.splitlines() if l.strip()]


def test_streams_contract_events():
    seen = []
    with client(fake_ollama(OK, seen=seen)) as c:
        res = c.post("/api/chat", json=Q)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/x-ndjson")
    ev = events(res)
    assert ev[0] == {"type": "sources", "items": []}
    assert [e["text"] for e in ev if e["type"] == "token"] == ["Trees ", "shade [1]."]
    done = ev[-1]
    assert done["type"] == "done" and done["tokens"] == 7
    assert done["measured"] is False and done["cached"] is False and done["energyWh"] >= 0

    body = seen[0]
    assert body["stream"] is True and body["think"] is False
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][-1]["content"].endswith("QUESTION: Why do trees cool streets?")


def test_ollama_error_becomes_error_event():
    with client(fake_ollama([{"error": "model not found"}], status=404)) as c:
        ev = events(c.post("/api/chat", json=Q))
    assert ev[-1]["type"] == "error"


def test_ollama_unreachable_becomes_error_event():
    def boom(req):
        raise httpx.ConnectError("refused")

    with client(httpx.MockTransport(boom)) as c:
        ev = events(c.post("/api/chat", json=Q))
    assert ev[0]["type"] == "sources" and ev[-1]["type"] == "error"


def test_validation():
    with client(fake_ollama(OK)) as c:
        too_long = {"messages": [{"role": "user", "content": "x" * 2001}]}
        too_many = {"messages": [{"role": "user", "content": "hi"}] * 11}
        ends_assistant = {"messages": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "yo"}]}
        bad_role = {"messages": [{"role": "system", "content": "hi"}]}
        for bad in (too_long, too_many, ends_assistant, bad_role, {"messages": []}):
            assert c.post("/api/chat", json=bad).status_code == 422


def test_accepts_frontend_context():
    ctx = {"nb": "Broadway East", "site": {"id": "12", "nb": "Broadway East", "species": "Red maple", "cost": 1000,
                                            "space": "Tree Lawn", "rank": 3, "shap": [["imperv", 2.1]]}}
    with client(fake_ollama(OK)) as c:
        assert c.post("/api/chat", json={**Q, "mode": "learn", "context": ctx}).status_code == 200


def test_rate_limit():
    with client(fake_ollama(OK), rate_limit="3/minute") as c:
        codes = [c.post("/api/chat", json=Q).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_health_and_cors():
    with client(fake_ollama(OK), model="m", region="Toronto", allowed_origins=["https://x.test"]) as c:
        assert c.get("/api/health").json() == {"model": "m", "provider": "ollama", "region": "Toronto"}
        pre = c.options("/api/chat", headers={"Origin": "https://x.test", "Access-Control-Request-Method": "POST",
                                              "Access-Control-Request-Headers": "content-type"})
        assert pre.headers["access-control-allow-origin"] == "https://x.test"
        other = c.get("/api/health", headers={"Origin": "https://evil.test"})
        assert "access-control-allow-origin" not in other.headers
