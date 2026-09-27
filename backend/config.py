"""Settings, read once from the environment (plan §10.4, deploy/api.service)."""

import os
from dataclasses import dataclass, field


def _list(name: str, default: str) -> list[str]:
    return [s.strip() for s in os.getenv(name, default).split(",") if s.strip()]


@dataclass(frozen=True)
class Settings:
    ollama_url: str = field(default_factory=lambda: os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"))
    model: str = field(default_factory=lambda: os.getenv("MODEL", "qwen3.5:2b"))
    embed_model: str = field(default_factory=lambda: os.getenv("EMBED_MODEL", "embeddinggemma"))
    region: str = field(default_factory=lambda: os.getenv("REGION_LABEL", "local"))
    # Link shown on "App data" source cards.
    app_url: str = field(default_factory=lambda: os.getenv("APP_URL", "https://github.com/allisonylee/hackumbc2026"))
    # Vite dev (5173) and `vite preview` (4173) by default; add the deployed site's origin in production.
    allowed_origins: list[str] = field(
        default_factory=lambda: _list("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:4173")
    )
    rate_limit: str = field(default_factory=lambda: os.getenv("RATE_LIMIT", "10/minute"))
    num_predict: int = field(default_factory=lambda: int(os.getenv("NUM_PREDICT", "300")))
    # Ollama's default is 4096; four ~400-word source chunks + facts + history can exceed it.
    num_ctx: int = field(default_factory=lambda: int(os.getenv("NUM_CTX", "8192")))
    temperature: float = field(default_factory=lambda: float(os.getenv("TEMPERATURE", "0.3")))
    keep_alive: str = field(default_factory=lambda: os.getenv("KEEP_ALIVE", "30m"))
    # Joules per generated token, the fallback estimate when energy can't be measured and ESTIMATE_WATTS
    # is unset. From calibrate_energy.py on an M2 MacBook (plugged in, Low Power Mode off), 2026-09-26:
    # two runs gave 0.51 and 0.71 J/token (incl. prompt reading); 0.6 is their midpoint. Mac-only figure.
    j_per_token: float = field(default_factory=lambda: float(os.getenv("J_PER_TOKEN", "0.6")))
    # MEASURE_ENERGY=0 skips zeus-apple-silicon even on a Mac (tests; or to compare against the estimate).
    measure_energy: bool = field(default_factory=lambda: os.getenv("MEASURE_ENERGY", "1") != "0")
    # For machines without energy counters (the droplet): estimate = Ollama's generation seconds × this.
    estimate_watts: float | None = field(
        default_factory=lambda: float(os.environ["ESTIMATE_WATTS"]) if os.getenv("ESTIMATE_WATTS") else None)


# Request limits, mirrored by web/src/features/chat/llm.ts.
MAX_CHARS = 2000
MAX_MESSAGES = 10
