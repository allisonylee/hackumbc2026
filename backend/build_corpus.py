"""Build the chat's search index from corpus/*.md (plan §10.1).

Run from backend/:
  python build_corpus.py           # chunk + embed → data/chunks.json, data/corpus_index.npz
  python build_corpus.py --check   # validate and chunk only (no Ollama)
  python build_corpus.py --web     # also write web/public/data/corpus_chunks.json (on-device mode)
"""

import argparse
import json
import re
import sys
from pathlib import Path

import httpx
import numpy as np
import yaml

from config import Settings
from embed import doc_text, embed_sync

HERE = Path(__file__).parent
CORPUS = HERE / "corpus"
DATA = HERE / "data"
WEB_OUT = HERE.parent / "web" / "public" / "data" / "corpus_chunks.json"

TARGET_WORDS = 350  # start a new chunk past this
MAX_WORDS = 400  # a single paragraph longer than this is split by sentence
MIN_TAIL_WORDS = 80  # a shorter final chunk is merged into the previous one
REQUIRED = ("title", "url", "source")
FRONT = re.compile(r"\A---\s*\n(.*?)\n---\s*\n(.*)\Z", re.S)


def words(s: str) -> int:
    return len(s.split())


def parse_doc(path: Path) -> dict:
    m = FRONT.match(path.read_text(encoding="utf-8"))
    if not m:
        raise ValueError(f"{path.name}: missing --- front-matter ---")
    meta = yaml.safe_load(m.group(1)) or {}
    missing = [k for k in REQUIRED if not str(meta.get(k, "")).strip()]
    if missing:
        raise ValueError(f"{path.name}: front-matter missing {', '.join(missing)}")
    if not str(meta["url"]).startswith(("http://", "https://")):
        raise ValueError(f"{path.name}: url must start with http(s)://")
    body = m.group(2).strip()
    if not body:
        raise ValueError(f"{path.name}: empty body")
    return {"doc": path.stem, "title": str(meta["title"]).strip(), "url": str(meta["url"]).strip(),
            "source": str(meta["source"]).strip(), "body": body}


def _pieces(body: str) -> list[str]:
    """Paragraphs, with any paragraph over MAX_WORDS split at sentence ends."""
    out = []
    for para in re.split(r"\n\s*\n", body):
        para = para.strip()
        if not para:
            continue
        if words(para) <= MAX_WORDS:
            out.append(para)
            continue
        cur = ""
        for sent in re.split(r"(?<=[.!?])\s+", para):
            if cur and words(cur) + words(sent) > TARGET_WORDS:
                out.append(cur)
                cur = sent
            else:
                cur = f"{cur} {sent}".strip()
        if cur:
            out.append(cur)
    return out


def chunk_body(body: str) -> list[str]:
    chunks: list[str] = []
    cur: list[str] = []
    for piece in _pieces(body):
        if cur and words("\n\n".join(cur)) + words(piece) > TARGET_WORDS:
            chunks.append("\n\n".join(cur))
            cur = []
        cur.append(piece)
    if cur:
        tail = "\n\n".join(cur)
        if chunks and words(tail) < MIN_TAIL_WORDS:
            chunks[-1] += "\n\n" + tail
        else:
            chunks.append(tail)
    return chunks


def load_chunks(corpus: Path = CORPUS) -> list[dict]:
    docs = [parse_doc(p) for p in sorted(corpus.glob("*.md"))]
    titles = [d["title"] for d in docs]
    dupes = {t for t in titles if titles.count(t) > 1}
    if dupes:
        raise ValueError(f"duplicate titles: {sorted(dupes)}")
    chunks = []
    for d in docs:
        n = words(d["body"])
        if not 100 <= n <= 600:
            print(f"warning: {d['doc']}.md has {n} words", file=sys.stderr)
        for i, text in enumerate(chunk_body(d["body"])):
            chunks.append({"id": f"{d['doc']}#{i}", "doc": d["doc"], "title": d["title"], "url": d["url"],
                           "source": d["source"], "text": text})
    return chunks


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="validate and chunk only; don't embed")
    ap.add_argument("--web", action="store_true", help="also write web/public/data/corpus_chunks.json")
    args = ap.parse_args()

    chunks = load_chunks()
    n_docs = len({c["doc"] for c in chunks})
    sizes = [words(c["text"]) for c in chunks]
    print(f"{n_docs} docs → {len(chunks)} chunks ({min(sizes)}–{max(sizes)} words, mean {np.mean(sizes):.0f})")
    if args.check:
        return

    settings = Settings()
    with httpx.Client(timeout=120) as client:
        vecs = np.concatenate([
            embed_sync(client, settings, [doc_text(c["title"], c["text"]) for c in chunks[i:i + 16]])
            for i in range(0, len(chunks), 16)
        ])

    DATA.mkdir(exist_ok=True)
    (DATA / "chunks.json").write_text(json.dumps(chunks, ensure_ascii=False, indent=1), encoding="utf-8")
    np.savez_compressed(DATA / "corpus_index.npz", vectors=vecs, ids=np.array([c["id"] for c in chunks]),
                        model=np.array(settings.embed_model))
    print(f"wrote {DATA / 'chunks.json'} and corpus_index.npz ({vecs.shape[0]}×{vecs.shape[1]}, {settings.embed_model})")

    if args.web:
        web = [{k: c[k] for k in ("id", "title", "url", "source", "text")} for c in chunks]
        WEB_OUT.write_text(json.dumps(web, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {WEB_OUT}")


if __name__ == "__main__":
    main()
