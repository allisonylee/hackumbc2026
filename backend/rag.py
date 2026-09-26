"""Hybrid search over the corpus (plan §10.2): embeddinggemma cosine + BM25, fused by reciprocal rank.

Keyword search matters for names ("Broadway East", "McElderry Park", "hedge maple") that the
embedding model scores weakly. BM25 indexes words and adjacent word pairs, so a phrase match
outranks two separate word matches.
"""

import json
import logging
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import httpx
import numpy as np

from config import Settings
from embed import embed, query_text

log = logging.getLogger("canopy")
DATA = Path(__file__).parent / "data"

K = 4  # chunks returned
POOL = 12  # candidates taken from each ranking before fusion
RRF_K = 60
SIM_MIN = 0.30  # relevant by meaning: off-topic questions score ~0.1–0.2, on-topic ≥ ~0.35
KW_MIN = 0.5  # ...or by keywords: matches this share of the query's keyword weight
SIM_FLOOR = 0.20  # a keyword match still needs this much similarity ("capital of France" ≠ Capital News Service)
BM25_K1, BM25_B = 1.5, 0.75

STOP = set("""a an and are as at be been but by can could do does did for from had has have how i if in into is it
its me my no not of on or our so than that the their them then there these they this to too was we were what when
where which who why will with would you your about should any some also just more most very get tell please""".split())


def tokens(text: str) -> list[str]:
    """Lowercased words minus stopwords, plus adjacent-word bigrams ("broadway_east")."""
    words = [w for w in re.findall(r"[a-z0-9]+", text.lower().replace("'", "")) if w not in STOP]
    words = [w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in words]
    return words + [f"{a}_{b}" for a, b in zip(words, words[1:])]


@dataclass
class Hit:
    chunk: dict
    score: float  # fused RRF score
    cos: float
    kw: float  # share of the query's keyword (idf) weight this chunk matches, 0–1


class BM25:
    def __init__(self, docs: list[list[str]]):
        self.tfs = [Counter(d) for d in docs]
        self.lens = np.array([len(d) for d in docs], dtype=float)
        self.avg = float(self.lens.mean()) if docs else 0.0
        df = Counter(t for tf in self.tfs for t in tf)
        n = len(docs)
        self.idf = {t: math.log(1 + (n - c + 0.5) / (c + 0.5)) for t, c in df.items()}

    def scores(self, q: list[str]) -> np.ndarray:
        out = np.zeros(len(self.tfs))
        for t in set(q):
            idf = self.idf.get(t)
            if idf is None:
                continue
            for i, tf in enumerate(self.tfs):
                f = tf.get(t)
                if f:
                    norm = BM25_K1 * (1 - BM25_B + BM25_B * self.lens[i] / self.avg)
                    out[i] += idf * f * (BM25_K1 + 1) / (f + norm)
        return out

    def coverage(self, q: list[str]) -> np.ndarray:
        """Share of the query's idf weight present in each chunk. Single words only (bigrams would
        double-count), and words the corpus lacks count at the maximum idf, so "pizza in Baltimore"
        doesn't fully match every chunk that says Baltimore."""
        terms = {t for t in q if "_" not in t}
        top = max(self.idf.values(), default=0.0)
        weight = {t: self.idf.get(t, top) for t in terms}
        total = sum(weight.values())
        if not total:
            return np.zeros(len(self.tfs))
        return np.array([sum(w for t, w in weight.items() if t in tf) / total for tf in self.tfs])


class Index:
    def __init__(self, chunks: list[dict], vectors: np.ndarray | None):
        self.chunks = chunks
        self.vectors = vectors
        # Title counts twice: it's the doc's own summary of what it covers.
        self.bm25 = BM25([tokens(f"{c['title']} {c['title']} {c['text']}") for c in chunks])

    @classmethod
    def load(cls, settings: Settings, data: Path = DATA) -> "Index | None":
        try:
            chunks = json.loads((data / "chunks.json").read_text(encoding="utf-8"))
            z = np.load(data / "corpus_index.npz")
        except FileNotFoundError:
            log.warning("no corpus index in %s; run build_corpus.py. Chat will answer without sources.", data)
            return None
        if [c["id"] for c in chunks] != list(z["ids"]):
            raise ValueError("chunks.json and corpus_index.npz are out of sync; rerun build_corpus.py")
        built_with = str(z["model"])
        if built_with != settings.embed_model:
            raise ValueError(f"index built with {built_with!r} but EMBED_MODEL is {settings.embed_model!r}")
        return cls(chunks, z["vectors"])

    def lowercase_words(self) -> set[str]:
        """Words the corpus uses in lowercase, i.e. as ordinary words rather than names."""
        return {w for c in self.chunks for w in re.findall(r"\b[a-z]+\b", c["text"])}

    def search(self, q: str, qvec: np.ndarray | None, k: int = K) -> list[Hit]:
        """qvec=None (embedding unavailable) falls back to keywords only."""
        qt = tokens(q)
        bm = self.bm25.scores(qt)
        cov = self.bm25.coverage(qt)
        cos = self.vectors @ qvec if qvec is not None else np.zeros(len(self.chunks))

        fused: dict[int, float] = {}
        rankings = [bm] if qvec is None else [cos, bm]
        for scores in rankings:
            for rank, i in enumerate(np.argsort(-scores)[:POOL]):
                if scores[i] > 0:
                    fused[i] = fused.get(i, 0.0) + 1 / (RRF_K + rank)

        hits, seen_docs = [], set()
        for i in sorted(fused, key=fused.get, reverse=True):
            c = self.chunks[i]
            relevant = cos[i] >= SIM_MIN or (cov[i] >= KW_MIN and (qvec is None or cos[i] >= SIM_FLOOR))
            if not relevant or c["doc"] in seen_docs:  # one chunk per doc keeps the sources varied
                continue
            seen_docs.add(c["doc"])
            hits.append(Hit(c, fused[i], float(cos[i]), float(cov[i])))
            if len(hits) == k:
                break
        return hits


async def retrieve(index: Index | None, client: httpx.AsyncClient, settings: Settings, q: str, k: int = K) -> list[Hit]:
    if index is None or not q.strip():
        return []
    try:
        qvec = (await embed(client, settings, [query_text(q)]))[0]
    except (httpx.HTTPError, RuntimeError, ValueError) as e:  # ValueError: malformed JSON
        log.warning("query embedding failed (%s); using keyword search only", e)
        qvec = None
    return index.search(q, qvec, k)


def search_query(history: list[dict]) -> str:
    """The newest user turn; a short follow-up ("what about oaks?") also carries the previous user turn."""
    users = [m["content"] for m in history if m["role"] == "user"]
    q = users[-1]
    if len(q.split()) < 8 and len(users) > 1:
        q = f"{users[-2]} {q}"
    return q


def format_sources(hits: list[Hit], facts: list | None = None, app_url: str = "") -> tuple[list[dict], str]:
    """(items for the `sources` event, SOURCES block for the prompt). App-data facts come first."""
    entries = [(f.title, app_url, "Baltimore Tree Planting Planner", f.text) for f in facts or []]
    entries += [(h.chunk["title"], h.chunk["url"], h.chunk["source"], h.chunk["text"]) for h in hits]
    items = [{"n": n, "title": t, "url": u} for n, (t, u, _, _) in enumerate(entries, 1)]
    block = "\n\n".join(f"[{n}] {t} ({src})\n{text}" for n, (t, _, src, text) in enumerate(entries, 1))
    return items, (f"SOURCES:\n{block}" if entries else "")
