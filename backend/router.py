"""Question routing (plan §10.3): decide which app-data facts go with a question. No LLM calls.

- a site popup (context.site) → that site's facts and heat drivers;
- a neighborhood (context.nb, or a name fuzzy-matched in the question with rapidfuzz) → its facts;
- species words (narrow, power lines, which tree…) → the app's species list;
- always: corpus search, with fewer chunks when facts are present.
"""

import re
from dataclasses import dataclass, field

from rapidfuzz import fuzz, process

from tools import AppData, Fact

NAME_MIN = 85  # rapidfuzz ratio for a neighborhood name match (plan: score ≥ 85)
WORD_MIN = 75  # ...and each word must match too, so "a street" ≠ "Gay Street" but "est" = "east"
SINGLE_MIN = 90  # one-word names need a closer match: "parkland" ≠ "Parklane", "uploads" ≠ "Uplands"
MAX_NBS = 2  # "compare Canton and Hampden"

SPECIES_RE = re.compile(
    r"\b(species|which trees?|what (kind of |type of )?trees?|trees? (should|could|would|can) i plant|native trees?"
    r"|narrow|small (pit|space|yard|sidewalk)|tree pit|power ?lines?|wires?|utility|utilities)\b", re.I)
WIRES_RE = re.compile(r"\b(power ?lines?|wires?|utility|utilities)\b", re.I)
NARROW_RE = re.compile(r"\b(narrow|small (pit|space|sidewalk)|tight)\b", re.I)


def _norm_words(s: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", s.lower().replace("'", ""))


@dataclass
class Route:
    facts: list[Fact] = field(default_factory=list)
    neighborhoods: list[str] = field(default_factory=list)
    extra_query: str = ""  # appended to the search query (e.g. the site's species)


class NeighborhoodMatcher:
    """Fuzzy-matches neighborhood names against word windows of the question, so typos match
    ("Broadway Est") but names inside other words don't ("Canton" in "Cantonese")."""

    def __init__(self, names: list[str], common_words: set[str]):
        self.aliases: list[tuple[str, list[str], bool]] = []  # (neighborhood, alias words, needs capital)
        for name in names:
            variants = {name, *[p.strip() for p in re.split(r"/", name) if p.strip()]}
            for alias in variants:
                words = _norm_words(alias)
                if not words:
                    continue
                # A one-word name that's also an ordinary word in the corpus ("Evergreen", "CARE", "Glen")
                # only counts when written with its capital, as a name.
                ambiguous = len(words) == 1 and process.extractOne(
                    words[0], common_words, scorer=fuzz.ratio, score_cutoff=SINGLE_MIN) is not None
                self.aliases.append((name, words, ambiguous))

    def find(self, question: str) -> list[str]:
        q_words = _norm_words(question)
        raw_words = re.findall(r"[A-Za-z0-9']+", question)
        found: list[tuple[float, int, int, int, str]] = []  # (score, n words, start, end, name)
        for name, words, ambiguous in self.aliases:
            n = len(words)
            target = " ".join(words)
            for i in range(len(q_words) - n + 1):
                window = q_words[i:i + n]
                score = fuzz.ratio(" ".join(window), target)
                if score < (SINGLE_MIN if n == 1 else NAME_MIN):
                    continue
                if any(a[0] != b[0] or fuzz.ratio(a, b) < WORD_MIN for a, b in zip(window, words)):
                    continue
                if ambiguous and not (i < len(raw_words) and raw_words[i][:1].isupper()):
                    continue
                found.append((score, n, i, i + n, name))
        # Best and longest first; drop matches overlapping a better one ("North Roland Park" over "Roland Park").
        found.sort(key=lambda t: (-t[0], -t[1]))
        taken: list[tuple[int, int, str]] = []
        for _, _, a, b, name in found:
            if any(name == n or (a < tb and ta < b) for ta, tb, n in taken):
                continue
            taken.append((a, b, name))
        return [n for _, _, n in sorted(taken)][:MAX_NBS]  # in the order the question names them


class Router:
    def __init__(self, data: AppData | None, common_words: set[str] = frozenset()):
        self.data = data
        self.matcher = NeighborhoodMatcher(list(data.nbs), set(common_words)) if data else None

    def route(self, question: str, context: dict | None = None) -> Route:
        r = Route()
        if self.data is None:
            return r
        context = context or {}
        site = context.get("site") or None
        if site:
            fact = self.data.site_fact(str(site.get("id", "")), site.get("rank"))
            if fact:
                r.facts.append(fact)
                r.extra_query = f"how the plan tab chooses where to plant trees {site.get('species', '')}"

        names = [context["nb"]] if context.get("nb") in self.data.nbs else []
        names += [n for n in self.matcher.find(question) if n not in names]
        if site and site.get("nb") in names:  # the site fact already covers its own neighborhood's block
            names.remove(site["nb"])
        for name in names[:MAX_NBS]:
            fact = self.data.neighborhood_fact(name)
            if fact:
                r.facts.append(fact)
                r.neighborhoods.append(name)

        if len(r.neighborhoods) == 2:
            fact = self.data.comparison_fact(*r.neighborhoods)
            if fact:
                r.facts.insert(len(r.facts) - 2, fact)  # before the two neighborhood blocks

        if SPECIES_RE.search(question):
            fact = self.data.species_fact(under_wires=bool(WIRES_RE.search(question)),
                                          narrow=bool(NARROW_RE.search(question)))
            if fact:
                r.facts.append(fact)
        return r
