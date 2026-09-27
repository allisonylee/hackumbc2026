"""Answer cache (plan §10.4).

Two layers, both for first questions only (no earlier turns), since history changes the answer:
- cached_answers.json: pre-generated answers to the suggested questions, written by gen_cache.py and
  served only once a person has reviewed them ("reviewed": true);
- an in-memory LRU of answers generated since startup, keyed by the question and its context.
Cached answers are streamed with cached=true and energyWh=0 (contract: no energy beyond the one-time generation).
"""

import json
import logging
import re
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

log = logging.getLogger("canopy")
CACHE_FILE = Path(__file__).parent / "data" / "cached_answers.json"
LRU_SIZE = 256


def normalize(q: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", q.lower().replace("'", "")))


def key(history: list[dict], context: dict | None) -> str | None:
    """Cache key for a first question; None when the conversation already has earlier turns."""
    if len(history) != 1:
        return None
    ctx = json.dumps(context, sort_keys=True) if context and any(context.values()) else ""
    return f"{normalize(history[0]['content'])}|{ctx}"


@dataclass
class Answer:
    sources: list[dict]
    text: str
    tokens: int


def tokens_of(text: str) -> list[str]:
    """Stream a cached answer as word-sized chunks, keeping the whitespace."""
    return re.findall(r"\S+\s*|\s+", text)


class AnswerCache:
    def __init__(self, path: Path | None = CACHE_FILE, size: int = LRU_SIZE):
        self.fixed: dict[str, Answer] = {}
        self.lru: OrderedDict[str, Answer] = OrderedDict()
        self.size = size
        if path and path.exists():
            entries = json.loads(path.read_text(encoding="utf-8"))
            for e in entries:
                if e.get("reviewed"):
                    self.fixed[key([{"content": e["question"]}], None)] = Answer(e["sources"], e["text"], e["tokens"])
            skipped = len(entries) - len(self.fixed)
            if skipped:
                log.info("cache: %d pre-generated answers not reviewed yet; not serving them", skipped)

    def get(self, k: str | None) -> Answer | None:
        if k is None:
            return None
        if k in self.fixed:
            return self.fixed[k]
        a = self.lru.get(k)
        if a is not None:
            self.lru.move_to_end(k)
        return a

    def put(self, k: str | None, answer: Answer) -> None:
        if k is None or k in self.fixed or not answer.text.strip():
            return
        self.lru[k] = answer
        self.lru.move_to_end(k)
        while len(self.lru) > self.size:
            self.lru.popitem(last=False)
