"""Energy per answer (plan §10.4).

Measured (Mac with zeus-apple-silicon): the chip's energy counters (CPU, GPU, Neural Engine, DRAM) are
system-wide, so they include Ollama's separate process, and also everything else running. Each answer's
figure is its window's energy minus the idle baseline power × the window's duration. The baseline is
re-sampled whenever no answer is running, so background load (browser, other apps) is subtracted.
Apple's counters are model-based estimates from the chip, not an external meter.

Estimated (droplet or any machine without counters): Ollama's generation seconds × ESTIMATE_WATTS if
set, otherwise tokens × J_PER_TOKEN (calibrated on the Mac with calibrate_energy.py). measured=False.
"""

import asyncio
import itertools
import logging
import time
from dataclasses import dataclass

from config import Settings

log = logging.getLogger("canopy")

BASELINE_EVERY_S = 20  # how often to re-sample idle power
BASELINE_WINDOW_S = 1.0
BASELINE_ALPHA = 0.3  # EMA weight of each new sample


def estimate_wh(tokens: int, j_per_token: float) -> float:
    return tokens * j_per_token / 3600


def total_mj(m) -> float:
    """Sum of the zeus fields that cover the whole SoC; missing fields (older chips) count as 0."""
    return float(sum(getattr(m, f, 0) or 0 for f in ("cpu_total_mj", "gpu_mj", "gpu_sram_mj", "ane_mj", "dram_mj")))


@dataclass
class Reading:
    wh: float
    measured: bool


Handle = tuple[str, float] | None


class EnergyMeter:
    """start() before an answer's work, then exactly one of finish() or cancel()."""

    def __init__(self, settings: Settings, monitor=None):
        self.settings = settings
        self.monitor = monitor if monitor is not None else (self._zeus() if settings.measure_energy else None)
        self.baseline_w: float | None = None
        self.active = 0
        self._ids = itertools.count()

    @staticmethod
    def _zeus():
        try:
            from zeus_apple_silicon import AppleEnergyMonitor

            return AppleEnergyMonitor()
        except Exception as e:  # not a Mac, not installed, or counters unavailable
            log.info("energy: zeus-apple-silicon unavailable (%s); answers will be estimated", e)
            return None

    @property
    def measuring(self) -> bool:
        return self.monitor is not None and self.baseline_w is not None

    def _update_baseline(self, w: float) -> None:
        self.baseline_w = w if self.baseline_w is None else (1 - BASELINE_ALPHA) * self.baseline_w + BASELINE_ALPHA * w

    async def sample_baseline(self) -> None:
        """One idle sample; skipped (not recorded) if an answer overlapped it."""
        if self.monitor is None or self.active:
            return
        name = f"baseline-{next(self._ids)}"
        t0 = time.monotonic()
        self.monitor.begin_window(name)
        await asyncio.sleep(BASELINE_WINDOW_S)
        m = self.monitor.end_window(name)
        if self.active == 0:
            self._update_baseline(total_mj(m) / 1000 / (time.monotonic() - t0))

    async def keep_baseline(self) -> None:
        """Background task: refresh the idle baseline between answers."""
        while True:
            await asyncio.sleep(BASELINE_EVERY_S)
            await self.sample_baseline()

    def start(self) -> Handle:
        self.active += 1
        if not self.measuring:
            return None
        name = f"answer-{next(self._ids)}"
        self.monitor.begin_window(name)
        return name, time.monotonic()

    def finish(self, handle: Handle, tokens: int, gen_seconds: float) -> Reading:
        self.active -= 1
        if handle is not None:
            name, t0 = handle
            joules = total_mj(self.monitor.end_window(name)) / 1000
            above_idle = max(0.0, joules - self.baseline_w * (time.monotonic() - t0))
            return Reading(above_idle / 3600, True)
        if self.settings.estimate_watts:
            return Reading(gen_seconds * self.settings.estimate_watts / 3600, False)
        return Reading(estimate_wh(tokens, self.settings.j_per_token), False)

    def cancel(self, handle: Handle) -> None:
        """Close the window of an answer that failed or was abandoned, without reporting it."""
        self.active -= 1
        if handle is not None:
            self.monitor.end_window(handle[0])


def round_wh(wh: float) -> float:
    """Three significant digits: 0.0123 Wh, 0.456 Wh."""
    return float(f"{wh:.3g}")
