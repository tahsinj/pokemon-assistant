"""Train the matchup model for one format and export it.

Usage: uv run python -m train.matchup --format gen9ou [--data data/sim] [--out data/models]
"""

import argparse
import json
from datetime import date
from pathlib import Path

import lightgbm as lgb
import numpy as np
import polars as pl
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from eval.metrics import brier, calibration, log_loss, spearman_by_target
from export.onnx import export_lightgbm, model_card
from features.matchup import group_key, weighted_rows, with_mirror
from ingest.sim import DATA, checks, feature_names, pairs

LABELS = {"gen9ou": "Gen 9 OU", "gen9nationaldex": "National Dex OU"}
ROOT = Path(__file__).resolve().parent.parent


def evaluate(predict, test: pl.DataFrame, names: list[str], check_rows: pl.DataFrame) -> dict:
    x = test.select(names).to_numpy()
    win = test["win"].to_numpy()
    weight = test["games"].to_numpy().astype(float)
    p = predict(x)
    cp = predict(check_rows.select(names).to_numpy())
    return {
        "log_loss": log_loss(p, win, weight),
        "brier": brier(p, win, weight),
        "calibration": calibration(p, win),
        "spearman": spearman_by_target(check_rows["target"].to_list(), check_rows["score"].to_numpy(), cp),
        "checks_mean_win": float(cp.mean()),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--format", default="gen9ou")
    ap.add_argument("--data", type=Path, default=DATA)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "models")
    ap.add_argument("--cards", type=Path, default=ROOT.parent / "docs" / "models")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    fmt = args.format

    names = feature_names(fmt, args.data)
    df = pairs(fmt, args.data)
    check_rows = checks(fmt, args.data)
    split = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=args.seed)
    tr_idx, te_idx = next(split.split(np.zeros(len(df)), groups=group_key(df).to_numpy()))
    train = with_mirror(df[tr_idx], names)
    test = with_mirror(df[te_idx], names)

    # A slice of the training pairs decides when boosting stops.
    fit_idx, val_idx = next(GroupShuffleSplit(n_splits=1, test_size=0.1, random_state=args.seed + 1)
                            .split(np.zeros(len(tr_idx)), groups=group_key(df[tr_idx]).to_numpy()))
    fit = with_mirror(df[tr_idx][fit_idx], names)
    val = with_mirror(df[tr_idx][val_idx], names)

    def rows(frame: pl.DataFrame):
        return weighted_rows(frame.select(names).to_numpy(), frame["win"].to_numpy(), frame["games"].to_numpy())

    x, y, w = rows(train)
    fx, fy, fw = rows(fit)
    vx, vy, vw = rows(val)

    logistic = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000))
    logistic.fit(x, y, logisticregression__sample_weight=w)

    gbm = lgb.LGBMClassifier(n_estimators=3000, learning_rate=0.03, num_leaves=31, min_child_samples=40,
                             subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                             random_state=args.seed, verbose=-1)
    gbm.fit(fx, fy, sample_weight=fw, eval_X=(vx,), eval_y=(vy,), eval_sample_weight=[vw],
            callbacks=[lgb.early_stopping(100, verbose=False)])

    test_win = test["win"].to_numpy()
    metrics = {
        "format": fmt,
        "label": LABELS.get(fmt, fmt),
        "trained": date.today().isoformat(),
        "features": names,
        "data": {
            "pairs": len(df), "games": int(df["games"].max()), "offmeta": float((df["a_variant"] != "").mean()),
            "train_pairs": len(tr_idx), "test_pairs": len(te_idx),
        },
        "trees": int(gbm.best_iteration_ or gbm.n_estimators),
        "lightgbm": evaluate(lambda v: gbm.predict_proba(v)[:, 1], test, names, check_rows),
        "logistic": evaluate(lambda v: logistic.predict_proba(v)[:, 1], test, names, check_rows),
        "constant": {"log_loss": log_loss(np.full(len(test_win), 0.5), test_win),
                     "brier": brier(np.full(len(test_win), 0.5), test_win)},
    }

    out = args.out / fmt
    export_lightgbm(gbm, len(names), out / "matchup.onnx", test.select(names).to_numpy()[:500])
    (out / "metrics.json").write_text(json.dumps(metrics, indent=2))
    card = model_card(fmt, metrics)
    (out / "MODEL_CARD.md").write_text(card)
    args.cards.mkdir(parents=True, exist_ok=True)
    (args.cards / f"matchup-{fmt}.md").write_text(card)
    lg, lr = metrics["lightgbm"], metrics["logistic"]
    print(f"{fmt}: LightGBM log loss {lg['log_loss']:.4f}, Brier {lg['brier']:.4f}, Spearman {lg['spearman']['mean']:.3f}; "
          f"logistic {lr['log_loss']:.4f} / {lr['brier']:.4f} / {lr['spearman']['mean']:.3f}")


if __name__ == "__main__":
    main()
