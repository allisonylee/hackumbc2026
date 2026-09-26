"""Measure chat energy on this Mac and derive J_PER_TOKEN for machines that can't measure (plan §10.4).

Run from backend/ with Ollama running and the Mac otherwise idle (close heavy apps):
  python calibrate_energy.py            # 12 questions, after one warm-up
  python calibrate_energy.py --runs 2   # each question twice

Answers go through the real app (routing, search, generation), so the figure matches what the chat reports.
"""

import argparse
import json
import statistics
import time

from fastapi.testclient import TestClient

from config import Settings
from main import create_app

QUESTIONS = [
    "Why do trees cool streets?",
    "Why is my neighborhood hotter?",
    "Which tree fits a narrow sidewalk?",
    "How can I help?",
    "Why is Broadway East hot?",
    "Is Hampden greener than Remington?",
    "How much water does a new street tree need?",
    "Is redlining connected to heat in Baltimore?",
    "Will new trees raise my rent?",
    "How much energy does a chatbot answer use?",
    "How do I request a free street tree?",
    "What does the equity slider do?",
]


def ask(client: TestClient, q: str) -> tuple[dict, float]:
    t0 = time.monotonic()
    res = client.post("/api/chat", json={"messages": [{"role": "user", "content": q}]})
    events = [json.loads(l) for l in res.text.splitlines() if l.strip()]
    done = events[-1]
    if done.get("type") != "done":
        raise RuntimeError(f"{q!r} failed: {done}")
    return done, time.monotonic() - t0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1)
    args = ap.parse_args()

    settings = Settings(rate_limit="1000/minute")
    with TestClient(create_app(settings)) as c:
        if c.get("/api/health").json()["energy"] != "measured":
            raise SystemExit("energy isn't being measured (not a Mac, zeus missing, or MEASURE_ENERGY=0)")
        ask(c, "Hello")  # warm-up: loads the models so load time isn't counted
        rows = []
        for _ in range(args.runs):
            for q in QUESTIONS:
                done, secs = ask(c, q)
                j = done["energyWh"] * 3600
                rows.append((q, done["tokens"], j, secs))
                print(f"{j:7.1f} J  {done['tokens']:4d} tok  {secs:5.1f} s  {j / secs:5.1f} W  {q}")

    joules = [r[2] for r in rows]
    tokens = sum(r[1] for r in rows)
    print(f"\n{len(rows)} answers: median {statistics.median(joules):.1f} J "
          f"({statistics.median(joules) / 3600:.4f} Wh), mean {statistics.mean(joules):.1f} J, "
          f"range {min(joules):.1f}–{max(joules):.1f} J")
    print(f"J_PER_TOKEN = {sum(joules) / tokens:.3f}   (total J / generated tokens; includes prompt reading)")


if __name__ == "__main__":
    main()
