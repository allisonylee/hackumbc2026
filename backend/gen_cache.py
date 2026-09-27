"""Pre-generate answers to the chat's suggested questions (plan §10.4) → data/cached_answers.json.

Run from backend/ with Ollama running:
  python gen_cache.py            # (re)generate questions that aren't reviewed yet
  python gen_cache.py --force    # regenerate everything, clearing reviews

Then read each answer and its sources. Edit "text" if needed and set "reviewed": true. The server only
serves reviewed answers. Keep QUESTIONS in sync with SUGGESTED in web/src/features/chat/ChatDrawer.tsx.
"""

import argparse
import json
import time

from fastapi.testclient import TestClient

from cache import CACHE_FILE, AnswerCache, normalize
from config import Settings
from main import create_app

QUESTIONS = [
    "Why do trees cool streets?",
    "Why is my neighborhood hotter?",
    "Which tree fits a narrow sidewalk?",
    "How can I help?",
]


def generate(client: TestClient, q: str) -> dict:
    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": q}]})
    events = [json.loads(l) for l in res.text.splitlines() if l.strip()]
    done = events[-1]
    if done.get("type") != "done":
        raise RuntimeError(f"{q!r} failed: {done}")
    return {
        "question": q,
        "sources": next(e["items"] for e in events if e["type"] == "sources"),
        "text": "".join(e["text"] for e in events if e["type"] == "token").strip(),
        "tokens": done["tokens"],
        "generationWh": done["energyWh"],
        "measured": done["measured"],
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "reviewed": False,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate reviewed answers too")
    args = ap.parse_args()

    old = {normalize(e["question"]): e for e in json.loads(CACHE_FILE.read_text())} if CACHE_FILE.exists() else {}
    out = []
    # cache=AnswerCache(path=None): never answer from the cache we're building
    with TestClient(create_app(Settings(rate_limit="1000/minute"), cache=AnswerCache(path=None))) as c:
        for q in QUESTIONS:
            prev = old.get(normalize(q))
            if prev and prev.get("reviewed") and not args.force:
                print(f"keep (reviewed): {q}")
                out.append(prev)
                continue
            e = generate(c, q)
            out.append(e)
            print(f"\n=== {q}  ({e['tokens']} tokens, {e['generationWh']} Wh, measured={e['measured']})")
            for s in e["sources"]:
                print(f"  [{s['n']}] {s['title']}")
            print(e["text"])
    CACHE_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {CACHE_FILE}. Review each answer, then set \"reviewed\": true.")


if __name__ == "__main__":
    main()
