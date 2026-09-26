"""Fact blocks from the app's own data (plan §10.3). Deterministic: no LLM calls.

Reads web/public/data/ (CONTRACTS.md) at startup, so when the pipeline's real export replaces the
mock, the chat's facts update with no code change. Every number here comes from those files.
"""

import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median

log = logging.getLogger("canopy")
DEFAULT_DATA = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

# Plain-language names for heat-model features (pipeline §5.1), used to explain SHAP values.
FEATURE_LABELS = {
    "canopy": "tree canopy on this block",
    "imperv": "pavement and other hard surfaces on this block",
    "bldg": "buildings on this block",
    "road": "roads on this block",
    "lowveg": "grass and low plants on this block",
    "bare": "bare ground on this block",
    "canopyLag1": "tree canopy on the neighboring blocks",
    "canopyLag3": "tree canopy in the surrounding few blocks",
    "impervLag1": "pavement on the neighboring blocks",
    "impervLag3": "pavement in the surrounding few blocks",
    "waterNear": "nearby water",
    "distHarborKm": "distance from the Inner Harbor",
    "elev": "elevation",
    "ndvi": "how green the vegetation is",
}
SIZE_WORDS = {"small": "small", "medium": "medium-sized", "large": "large"}


@dataclass
class Fact:
    """One numbered source in the prompt: a titled block of app data."""

    title: str
    text: str


def pct(x: float | None, digits: int = 0) -> str:
    return "unknown" if x is None else f"{x * 100:.{digits}f}%"


def money(x: float | None) -> str:
    return "unknown" if x is None else f"${x:,.0f}"


def signed_f(x: float) -> str:
    return f"{abs(x):.1f}°F {'warmer' if x > 0 else 'cooler'}"


@dataclass
class AppData:
    nbs: dict[str, dict]  # name → neighborhoods.geojson properties
    sites: dict[str, dict]  # id → site
    hexes: dict[str, dict]  # h3 → hex (without gains)
    species: dict[str, dict]  # lowercased name → species
    stats: dict
    median_nb_heat: float | None = None
    mock: bool = field(init=False)

    def __post_init__(self):
        self.mock = bool(self.stats.get("mock"))
        heats = [p["heat"] for p in self.nbs.values() if p.get("heat") is not None]
        self.median_nb_heat = median(heats) if heats else None

    @classmethod
    def load(cls, data_dir: Path | None = None) -> "AppData | None":
        d = Path(data_dir or os.getenv("DATA_DIR") or DEFAULT_DATA)
        try:
            read = lambda name: json.loads((d / name).read_text(encoding="utf-8"))  # noqa: E731
            nbs = {f["properties"]["name"]: f["properties"] for f in read("neighborhoods.geojson")["features"]}
            sites = {s["id"]: s for s in read("sites.json")}
            hexes = {h["h3"]: {k: v for k, v in h.items() if k != "gains"} for h in read("hexes.json")}
            species = {s["name"].lower(): s for s in read("species.json")}
            stats = read("stats.json")
        except FileNotFoundError as e:
            log.warning("app data missing (%s); chat will answer without neighborhood or site facts", e)
            return None
        return cls(nbs, sites, hexes, species, stats)

    def _title(self, what: str) -> str:
        return f"App data{' (demo)' if self.mock else ''}: {what}"

    @property
    def provenance(self) -> str:
        if self.mock:
            return ("NOTE: these are placeholder demo numbers, not real measurements. If you use them, "
                    "say they are demo data.")
        return "Computed from public data (land cover, NOAA Heat Watch, Census, CDC)."

    # --- neighborhoods ---------------------------------------------------------------------------

    def neighborhood_fact(self, name: str) -> Fact | None:
        p = self.nbs.get(name)
        if p is None:
            return None
        n = len(self.nbs)
        city = self.stats.get("city", {})
        goal = city.get("canopyGoal")
        lines = [f"Neighborhood: {name}, Baltimore.", self.provenance]
        canopy = f"Tree canopy: {pct(p.get('canopy'), 1)} of the neighborhood"
        if city.get("canopy") is not None:
            canopy += f" (citywide: {pct(city['canopy'], 1)})"
        lines.append(canopy + ".")
        if goal is not None and p.get("canopyGap") is not None:
            gap = p["canopyGap"]
            lines.append(f"City canopy goal: {pct(goal)}. " + (
                f"This neighborhood is {gap * 100:.1f} percentage points below it." if gap > 0
                else "This neighborhood already meets it."))
        if p.get("heat") is not None:
            heat = f"Average afternoon air temperature on the NOAA Heat Watch day: {p['heat']:.1f}°F"
            if self.median_nb_heat is not None:
                heat += f", {signed_f(p['heat'] - self.median_nb_heat)} than the median neighborhood"
            lines.append(heat + ".")
        if p.get("rankHeat"):
            lines.append(f"Heat rank: {p['rankHeat']} of {n} neighborhoods (1 = hottest).")
        if p.get("rankCanopy"):
            lines.append(f"Canopy rank: {p['rankCanopy']} of {n} (1 = most tree canopy).")
        if p.get("pop") is not None:
            lines.append(f"Residents: {p['pop']:,}.")
        if p.get("income") is not None:
            lines.append(f"Median household income: {money(p['income'])}.")
        if p.get("poverty") is not None:
            lines.append(f"Share of residents below the poverty line: {pct(p['poverty'])}.")
        if p.get("asthma") is not None:
            lines.append(f"Adults with asthma: {p['asthma']:.1f}%.")
        if p.get("sites") is not None:
            lines.append(f"Open street-tree planting sites in the city inventory: {p['sites']:,}.")
        if p.get("tes") is not None:
            lines.append(f"Tree Equity Score: {p['tes']} of 100 (higher = more equitable canopy).")
        return Fact(self._title(f"{name} neighborhood"), "\n".join(lines))

    def comparison_fact(self, a: str, b: str) -> Fact | None:
        """Differences computed here, so the model never does arithmetic."""
        pa, pb = self.nbs.get(a), self.nbs.get(b)
        if not pa or not pb:
            return None
        lines = [f"Comparison of {a} and {b} (computed from the two neighborhoods' app data)."]
        ca, cb = pa.get("canopy"), pb.get("canopy")
        if ca is not None and cb is not None:
            more, less, d = (a, b, ca - cb) if ca >= cb else (b, a, cb - ca)
            lines.append(f"Tree canopy: {a} {pct(ca, 1)}, {b} {pct(cb, 1)}. "
                         + (f"{more} has {d * 100:.1f} percentage points more canopy than {less}." if d > 0
                            else "They have the same canopy."))
        ha, hb = pa.get("heat"), pb.get("heat")
        if ha is not None and hb is not None:
            hot, cool, d = (a, b, ha - hb) if ha >= hb else (b, a, hb - ha)
            lines.append(f"Afternoon air temperature: {a} {ha:.1f}°F, {b} {hb:.1f}°F. "
                         + (f"{hot} is {d:.1f}°F warmer than {cool}." if d > 0 else "They are equally warm."))
        return Fact(self._title(f"{a} vs. {b}"), "\n".join(lines)) if len(lines) > 1 else None

    # --- sites -----------------------------------------------------------------------------------

    def site_fact(self, site_id: str, rank: int | None = None) -> Fact | None:
        s = self.sites.get(site_id)
        if s is None:
            return None
        h = self.hexes.get(s["h3"], {})
        sp = self.species.get(s["species"].lower(), {})
        lines = [f"Planting site {site_id} in {s['nb']}, Baltimore.", self.provenance,
                 "How the planner picks sites: it ranks every open site by how much cooling a tree there would bring "
                 "to the people living on that block, per dollar, weighted by the chance the tree survives and by "
                 "the plan's priority sliders. Hot, paved, crowded blocks with little canopy rank highest."]
        if rank:
            lines.append(f"In the current plan, this was tree number {rank} in the order the planner picked sites.")
        why = []
        if h.get("heatPred") is not None:
            block = f"its predicted afternoon air temperature is {h['heatPred']:.1f}°F"
            if h.get("heatAnom") is not None:
                block += f", {signed_f(h['heatAnom'])} than the city median"
            why.append(block)
        if h.get("canopy") is not None:
            why.append(f"it has {pct(h['canopy'])} tree canopy")
        if h.get("imperv") is not None:
            why.append(f"{pct(h['imperv'])} of it is pavement or other hard surfaces")
        if h.get("pop") is not None:
            why.append(f"about {h['pop']:.0f} people live on it")
        if why:
            lines.append("This block: " + "; ".join(why) + ".")
        if h.get("shap"):
            parts = [f"{FEATURE_LABELS.get(f, f)} makes it {signed_f(v)}" for f, v in h["shap"]]
            lines.append("What the heat model says drives this block's temperature, compared with the city "
                         "average: " + "; ".join(parts) + ".")
        tree = f"Suggested tree: {s['species']}"
        if sp.get("latin"):
            tree += f" ({sp['latin']})"
        tree += f", a {SIZE_WORDS.get(s['size'], s['size'])} tree"
        if sp:
            tree += ", native" if sp.get("native") else ", not native"
        lines.append(tree + f". Chance it survives to maturity (planning assumption): {pct(s['surv'])}.")
        kind = ("an existing empty tree pit" if s["type"] == "pit"
                else "a spot where the sidewalk would have to be cut to make a new tree pit")
        width = f", {s['width']} ft wide" if s.get("width") else ""
        lines.append(f"Site details: {kind}{width}; space type {s.get('space') or 'unknown'}; overhead wires: "
                     f"{'yes' if s['util'] else 'no'}; estimated cost to plant {money(s['cost'])}.")
        return Fact(self._title(f"planting site in {s['nb']}"), "\n".join(lines))

    # --- species ---------------------------------------------------------------------------------

    def species_fact(self, under_wires: bool = False, narrow: bool = False) -> Fact | None:
        rows = list(self.species.values())
        if under_wires:
            rows = [r for r in rows if r.get("underWires")]
        if narrow and rows:
            smallest = min(r["minWidthFt"] for r in rows)
            rows = [r for r in rows if r["minWidthFt"] <= smallest]
        if not rows:
            return None
        head = "Street trees this app suggests"
        if under_wires or narrow:
            head += " for " + " and ".join(
                w for w, on in (("spots under overhead wires", under_wires), ("narrow spaces", narrow)) if on)
        lines = [head + ":"]
        for r in rows:
            desc = (f"- {r['name']} ({r['latin']}): {r['size']}; needs a space at least {r['minWidthFt']} ft wide; "
                    f"{'OK' if r['underWires'] else 'not for'} under power lines; "
                    f"{'native' if r['native'] else 'not native'}")
            if r.get("notes"):
                desc += f"; {r['notes']}"
            lines.append(desc + ".")
        lines.append("Baltimore's Forestry Division has the final say on species through its approved list and permits.")
        return Fact(self._title("suggested street tree species"), "\n".join(lines))
