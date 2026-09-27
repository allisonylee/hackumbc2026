import json

import httpx
import pytest
from fastapi.testclient import TestClient

from config import Settings
from main import create_app
from router import NeighborhoodMatcher, Router
from tools import AppData

NBS = {
    "Broadway East": {"name": "Broadway East", "canopy": 0.1, "canopyGap": 0.3, "heat": 96.0, "income": 30000,
                      "pop": 8000, "asthma": 14.2, "poverty": 0.3, "sites": 400, "rankHeat": 3, "rankCanopy": 270},
    "Roland Park": {"name": "Roland Park", "canopy": 0.6, "canopyGap": 0.0, "heat": 88.0, "income": 150000,
                    "pop": 7000, "asthma": 8.0, "poverty": 0.05, "sites": 20, "rankHeat": 270, "rankCanopy": 5},
    "North Roland Park/Poplar Hill": {"name": "North Roland Park/Poplar Hill", "canopy": 0.5, "canopyGap": 0.0,
                                      "heat": 89.0, "pop": 3000, "rankHeat": 260, "rankCanopy": 8},
    "Evergreen": {"name": "Evergreen", "canopy": 0.4, "canopyGap": 0.0, "heat": 90.0, "pop": 1000},
    "Canton": {"name": "Canton", "canopy": 0.15, "canopyGap": 0.25, "heat": 95.0, "pop": 8000},
    "CARE": {"name": "CARE", "canopy": 0.1, "canopyGap": 0.3, "heat": 94.0, "pop": 900},
    "Parklane": {"name": "Parklane", "canopy": 0.2, "canopyGap": 0.2, "heat": 93.0, "pop": 900},
    "Gay Street": {"name": "Gay Street", "canopy": 0.1, "canopyGap": 0.3, "heat": 97.0, "pop": 500},
}
SITES = {"7": {"id": "7", "h3": "h1", "type": "potential", "cost": 2000, "util": True, "width": 4,
               "space": "Tree Lawn", "nb": "Broadway East", "species": "Eastern redbud", "size": "small",
               "crown": 1, "surv": 0.7}}
HEXES = {"h1": {"h3": "h1", "canopy": 0.05, "imperv": 0.8, "heatPred": 97.2, "heatAnom": 4.1, "pop": 120.4,
                "shap": [["imperv", 2.1], ["canopyLag3", 1.2], ["waterNear", -0.6]]}}
SPECIES = {"eastern redbud": {"name": "Eastern redbud", "latin": "Cercis canadensis", "size": "small",
                              "underWires": True, "minWidthFt": 3, "native": True, "notes": "Spring flowers"},
           "willow oak": {"name": "Willow oak", "latin": "Quercus phellos", "size": "large", "underWires": False,
                          "minWidthFt": 6, "native": True, "notes": ""}}


def data(mock=False) -> AppData:
    stats = {"mock": mock, "city": {"canopy": 0.28, "canopyGoal": 0.4}}
    return AppData(dict(NBS), SITES, HEXES, SPECIES, stats)


def router() -> Router:
    return Router(data(), common_words={"evergreens", "trees", "care", "are"})


@pytest.mark.parametrize("q,expected", [
    ("Why is Broadway East so hot?", ["Broadway East"]),
    ("why is broadway est hot", ["Broadway East"]),  # typo, lowercase
    ("Tell me about North Roland Park", ["North Roland Park/Poplar Hill"]),  # longest match wins
    ("Compare Canton and Roland Park", ["Canton", "Roland Park"]),
    ("I love Cantonese food", []),  # no match inside a word
    ("How do I care for evergreen trees?", []),  # ordinary word, lowercase
    ("What's the canopy in Evergreen?", ["Evergreen"]),  # capitalized name
    ("Why do trees cool streets?", []),
    ("How do I request a street tree?", []),  # "a street" is not "Gay Street"
    ("Are redlined areas hotter?", []),  # "Are" is not "CARE"
    ("Plant trees on parkland", []),  # one-word names need a close match
])
def test_neighborhood_matching(q, expected):
    assert router().matcher.find(q) == expected


def test_neighborhood_fact_numbers_come_from_data():
    f = data().neighborhood_fact("Broadway East")
    assert f.title == "App data: Broadway East neighborhood"
    for s in ["10.0% of the neighborhood (citywide: 28.0%)", "30.0 percentage points below it", "96.0°F",
              "Heat rank: 3 of 8 neighborhoods (1 = hottest)", "$30,000", "14.2%", "400"]:
        assert s in f.text, s
    # median of 96, 88, 89, 90, 95, 94, 93, 97 = 93.5 → 2.5°F warmer
    assert "2.5°F warmer than the median neighborhood" in f.text
    assert "demo" not in f.text


def test_mock_data_is_flagged():
    f = data(mock=True).neighborhood_fact("Canton")
    assert f.title == "App data (demo): Canton neighborhood" and "demo numbers" in f.text


def test_site_fact_explains_heat_drivers():
    f = data().site_fact("7", rank=12)
    for s in ["tree number 12", "sidewalk would have to be cut", "$2,000", "overhead wires: yes",
              "Eastern redbud (Cercis canadensis), a small tree, native", "70%", "97.2°F, 4.1°F warmer",
              "5% tree canopy", "80% of it is pavement", "about 120 people live on it",
              "pavement and other hard surfaces on this block makes it 2.1°F warmer",
              "nearby water makes it 0.6°F cooler"]:
        assert s in f.text, s


def test_route_site_context_skips_duplicate_neighborhood():
    r = router().route("Why here?", {"site": {"id": "7", "nb": "Broadway East", "species": "Eastern redbud"}})
    assert [f.title for f in r.facts] == ["App data: planting site in Broadway East"]
    assert "Eastern redbud" in r.extra_query


def test_route_context_nb_and_species():
    r = router().route("Which tree fits under power lines?", {"nb": "Canton"})
    assert r.neighborhoods == ["Canton"]
    sp = r.facts[-1]
    assert sp.title == "App data: suggested street tree species"
    assert "Eastern redbud" in sp.text and "Willow oak" not in sp.text  # filtered to under-wires


def test_unknown_site_and_no_data_are_safe():
    assert router().route("Why here?", {"site": {"id": "nope", "nb": "X", "species": "Y"}}).facts == []
    assert Router(None).route("Why is Canton hot?").facts == []


def test_real_data_loads_and_matches():
    d = AppData.load()
    assert d is not None and len(d.nbs) > 200
    m = NeighborhoodMatcher(list(d.nbs), set())
    assert m.find("Why is Sandtown-Winchester hot?") == ["Sandtown-Winchester"]
    assert m.find("tell me about pigtown") == ["Washington Village/Pigtown"]


def test_chat_puts_facts_first_in_sources():
    seen = []

    def handler(req):
        if req.url.path == "/api/embed":
            return httpx.Response(500)  # embedding down: keyword search only
        seen.append(json.loads(req.content))
        return httpx.Response(200, content=(json.dumps({"message": {"content": "Hot [1]."}, "done": True,
                                                        "eval_count": 2}) + "\n").encode())

    app = create_app(Settings(app_url="https://app.test"), transport=httpx.MockTransport(handler), index=None,
                     data=data())
    with TestClient(app) as c:
        res = c.post("/api/chat", json={"messages": [{"role": "user", "content": "Why is Broadway East hot?"}]})
    ev = [json.loads(l) for l in res.text.splitlines()]
    assert ev[0]["items"][0] == {"n": 1, "title": "App data: Broadway East neighborhood", "url": "https://app.test"}
    assert "[1] App data: Broadway East neighborhood (A Tree Grows in Baltimore)" in seen[0]["messages"][-1]["content"]


def test_comparison_fact_does_the_arithmetic():
    r = router().route("Is Roland Park greener than Broadway East?")
    assert [f.title for f in r.facts] == ["App data: Roland Park vs. Broadway East",
                                          "App data: Roland Park neighborhood", "App data: Broadway East neighborhood"]
    t = r.facts[0].text
    assert "Roland Park has 50.0 percentage points more canopy than Broadway East." in t
    assert "Broadway East is 8.0°F warmer than Roland Park." in t
