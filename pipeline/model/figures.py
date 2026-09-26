"""Slide figures for the model (plan §5.3, §5.5) → interim/model/figures/{pd_canopy,shap_beeswarm}.png.

Run: python -m pipeline.model.figures   (after train_heat and curves)
"""
import json

import lightgbm as lgb
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import shap  # noqa: E402

from pipeline.model.train_heat import FEATS, MODEL_DIR, design  # noqa: E402

OUT = MODEL_DIR / "figures"


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    res = json.loads((MODEL_DIR / "results.json").read_text())
    x, y = zip(*res["pdCurve"])
    fig, ax = plt.subplots(figsize=(6, 4), dpi=150)
    ax.plot([v * 100 for v in x], y, color="#16a34a", lw=2.5)
    ax.set_xlabel("Tree canopy in the surrounding blocks (%)")
    ax.set_ylabel("Predicted afternoon air temperature (°F)")
    ax.set_title(f"More canopy, cooler blocks: {res['pdFPer10pct']:+.2f}°F per +10% canopy")
    ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(OUT / "pd_canopy.png")
    plt.close(fig)

    model = lgb.Booster(model_file=str(MODEL_DIR / "heat_lgbm.txt"))
    X = design("21")[1][FEATS]
    sv = shap.TreeExplainer(model).shap_values(X)
    plt.figure(dpi=150)
    shap.summary_plot(sv, X, show=False, max_display=len(FEATS))
    plt.xlabel("SHAP value (°F vs. the city average)")
    plt.tight_layout()
    plt.savefig(OUT / "shap_beeswarm.png")
    plt.close()
    print(f"wrote {OUT}/pd_canopy.png, shap_beeswarm.png")


if __name__ == "__main__":
    build()
