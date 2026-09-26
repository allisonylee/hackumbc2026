"""Energy per answer (plan §10.4).

Step 1: estimate only (tokens × J_PER_TOKEN, measured=False). Step 5 adds zeus-apple-silicon measurement on the Mac.
"""


def estimate_wh(tokens: int, j_per_token: float) -> float:
    return tokens * j_per_token / 3600
