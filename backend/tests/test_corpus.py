import json

import httpx
import numpy as np
import pytest

from build_corpus import chunk_body, load_chunks, parse_doc, words
from config import Settings
from embed import doc_text, embed_sync, query_text


def write(tmp_path, name, body, meta='title: "T"\nurl: https://x.test\nsource: S'):
    p = tmp_path / name
    p.write_text(f"---\n{meta}\n---\n\n{body}\n")
    return p


def para(n, w="word"):
    return " ".join([w] * n) + "."


def test_parse_doc(tmp_path):
    d = parse_doc(write(tmp_path, "heat-a.md", "Hello there."))
    assert d == {"doc": "heat-a", "title": "T", "url": "https://x.test", "source": "S", "body": "Hello there."}


@pytest.mark.parametrize("meta", ['title: "T"\nurl: https://x.test', 'title: "T"\nurl: x.test\nsource: S'])
def test_parse_doc_rejects_bad_front_matter(tmp_path, meta):
    with pytest.raises(ValueError):
        parse_doc(write(tmp_path, "bad.md", "Body.", meta))


def test_short_doc_is_one_chunk():
    assert chunk_body(f"{para(100)}\n\n{para(100)}") == [f"{para(100)}\n\n{para(100)}"]


def test_long_doc_splits_on_paragraphs_and_merges_short_tail():
    chunks = chunk_body("\n\n".join([para(200), para(200), para(30)]))
    assert len(chunks) == 2
    assert words(chunks[0]) == 200 and words(chunks[1]) == 230


def test_giant_paragraph_splits_by_sentence():
    chunks = chunk_body(" ".join([para(50)] * 12))  # one 600-word paragraph
    assert len(chunks) == 2 and all(words(c) <= 400 for c in chunks)


def test_duplicate_titles_rejected(tmp_path):
    write(tmp_path, "a.md", para(120))
    write(tmp_path, "b.md", para(120))
    with pytest.raises(ValueError, match="duplicate"):
        load_chunks(tmp_path)


def test_embed_uses_prefixes_and_normalizes():
    seen = []

    def handler(req):
        body = json.loads(req.content)
        seen.append(body)
        return httpx.Response(200, json={"embeddings": [[3.0, 4.0] for _ in body["input"]]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as c:
        v = embed_sync(c, Settings(embed_model="eg"), [doc_text("Title", "text"), query_text("q")])
    assert seen[0]["model"] == "eg"
    assert seen[0]["input"] == ["title: Title | text: text", "task: search result | query: q"]
    assert np.allclose(v, [[0.6, 0.8], [0.6, 0.8]])


def test_real_corpus_is_valid():
    chunks = load_chunks()
    assert len({c["doc"] for c in chunks}) >= 6
    assert len({c["id"] for c in chunks}) == len(chunks)
