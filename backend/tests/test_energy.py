import asyncio
import json
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient

import energy
from config import Settings
from energy import EnergyMeter, round_wh, total_mj
from main import create_app


class FakeMonitor:
    """Each window reports a fixed energy in mJ, split across the zeus fields."""

    def __init__(self, mj: float):
        self.mj, self.open = mj, set()

    def begin_window(self, name):
        self.open.add(name)

    def end_window(self, name):
        self.open.remove(name)
        return SimpleNamespace(cpu_total_mj=self.mj / 2, gpu_mj=self.mj / 4, gpu_sram_mj=0, ane_mj=None,
                               dram_mj=self.mj / 4)


def test_total_mj_ignores_missing_fields():
    assert total_mj(SimpleNamespace(cpu_total_mj=5, gpu_mj=None, dram_mj=2)) == 7


def test_measured_subtracts_idle_baseline(monkeypatch):
    m = EnergyMeter(Settings(), monitor=FakeMonitor(mj=36_000))  # 36 J per window
    m.baseline_w = 2.0
    clock = iter([100.0, 103.0])  # 3 s window → 6 J idle
    monkeypatch.setattr(energy.time, "monotonic", lambda: next(clock))
    r = m.finish(m.start(), tokens=50, gen_seconds=2.5)
    assert r.measured and abs(r.wh - 30 / 3600) < 1e-9 and m.active == 0


def test_no_baseline_yet_falls_back_to_estimate():
    m = EnergyMeter(Settings(j_per_token=0.36), monitor=FakeMonitor(mj=1))
    r = m.finish(m.start(), tokens=100, gen_seconds=4)
    assert not r.measured and abs(r.wh - 0.01) < 1e-12


def test_estimate_prefers_watts_times_seconds():
    m = EnergyMeter(Settings(estimate_watts=36.0))
    r = m.finish(m.start(), tokens=100, gen_seconds=10)
    assert not r.measured and abs(r.wh - 0.1) < 1e-12


def test_cancel_closes_window():
    mon = FakeMonitor(mj=10)
    m = EnergyMeter(Settings(), monitor=mon)
    m.baseline_w = 1.0
    h = m.start()
    m.cancel(h)
    assert not mon.open and m.active == 0


def test_baseline_sample_skipped_while_answer_runs(monkeypatch):
    monkeypatch.setattr(energy, "BASELINE_WINDOW_S", 0)
    m = EnergyMeter(Settings(), monitor=FakeMonitor(mj=1000))
    m.active = 1
    asyncio.run(m.sample_baseline())
    assert m.baseline_w is None
    m.active = 0
    asyncio.run(m.sample_baseline())
    assert m.baseline_w is not None and m.baseline_w > 0


def test_round_wh():
    assert round_wh(0.012345) == 0.0123 and round_wh(0.45678) == 0.457


def test_chat_done_event_uses_meter_and_health_reports_mode():
    def handler(req):
        done = {"message": {"content": "Hi."}, "done": True, "eval_count": 10,
                "prompt_eval_duration": 1e9, "eval_duration": 1e9}
        return httpx.Response(200, content=(json.dumps(done) + "\n").encode())

    meter = EnergyMeter(Settings(estimate_watts=18.0))
    app = create_app(Settings(), transport=httpx.MockTransport(handler), index=None, data=None, meter=meter)
    with TestClient(app) as c:
        res = c.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]})
        health = c.get("/api/health").json()
    done = json.loads(res.text.splitlines()[-1])
    assert done == {"type": "done", "tokens": 10, "energyWh": 0.01, "measured": False, "cached": False}  # 2 s × 18 W
    assert health["energy"] == "estimated" and meter.active == 0


def test_failed_answer_cancels_window():
    mon = FakeMonitor(mj=10)
    meter = EnergyMeter(Settings(), monitor=mon)
    meter.baseline_w = 1.0  # lifespan will re-sample; keep it measuring
    app = create_app(Settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500)), index=None,
                     data=None, meter=meter)
    with TestClient(app) as c:
        ev = [json.loads(l) for l in c.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}).text.splitlines()]
    assert ev[-1]["type"] == "error" and meter.active == 0 and not any(n.startswith("answer") for n in mon.open)
