"""Per-site rules shared by the mock and the real pipeline: species size, crown units, survival.

Survival is an assumption table (implementation_plan.md §4.5), not calibrated to local data:
the inventory's dead/stump shares are survivorship-biased (dead street trees become vacant sites).
"""
import numpy as np

from pipeline.config import CROWN_UNITS, SURV_MEAN

POTENTIAL_WIDTH_FT = 5  # potential pits have SPACEWIDTH "0" because the well isn't cut yet


def effective_width(typ, width):
    return POTENTIAL_WIDTH_FT if typ == "potential" else width


def size_class(util, typ, width):
    """Overhead lines or < 4 ft → small; 4–6 ft → medium; wider → large."""
    w = effective_width(typ, width) or 0
    if util or w < 4:
        return "small"
    return "medium" if w <= 6 else "large"


def crown_units(size):
    return CROWN_UNITS[size]


def surv_base(typ, space, width):
    w = effective_width(typ, width)
    if space == "Open/Unrestricted" or (w is not None and w >= 6):
        s = 0.75
    elif w is not None and w >= 4:
        s = 0.65
    else:
        s = 0.55  # narrow or unknown width
    if space == "Median/Island":
        s *= 0.9  # traffic, road salt
    return s


def rescale_surv(base):
    """Scale so the mean over all candidate sites equals SURV_MEAN; clip to [0, 1]."""
    base = np.asarray(base, dtype=float)
    return np.clip(base * SURV_MEAN / base.mean(), 0, 1)
