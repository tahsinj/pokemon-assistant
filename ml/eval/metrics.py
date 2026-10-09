"""Matchup model metrics: log loss and Brier score against simulated win
rates, a calibration table, and Spearman correlation with Smogon's checks
and counters."""

import numpy as np
from scipy.stats import spearmanr

EPS = 1e-6


def log_loss(p: np.ndarray, win: np.ndarray, weight: np.ndarray | None = None) -> float:
    p = np.clip(p, EPS, 1 - EPS)
    loss = -(win * np.log(p) + (1 - win) * np.log(1 - p))
    return float(np.average(loss, weights=weight))


def brier(p: np.ndarray, win: np.ndarray, weight: np.ndarray | None = None) -> float:
    return float(np.average((p - win) ** 2, weights=weight))


def calibration(p: np.ndarray, win: np.ndarray, bins: int = 10) -> list[dict]:
    """Mean prediction against mean simulated win rate in equal-width bins."""
    edges = np.linspace(0, 1, bins + 1)
    out = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p >= lo) & ((p < hi) if hi < 1 else (p <= hi))
        if m.any():
            out.append({"from": round(float(lo), 2), "to": round(float(hi), 2), "n": int(m.sum()),
                        "predicted": float(p[m].mean()), "actual": float(win[m].mean())})
    return out


def spearman_by_target(targets: list[str], smogon: np.ndarray, predicted: np.ndarray) -> dict:
    """Per target species, rank correlation between Smogon's check scores and the
    model's win chances for those checks; the mean over targets with 3+ checks."""
    per = {}
    for t in sorted(set(targets)):
        m = np.array([x == t for x in targets])
        if m.sum() < 3 or np.ptp(smogon[m]) == 0:
            continue
        rho = spearmanr(smogon[m], predicted[m]).statistic
        if np.isfinite(rho):
            per[t] = float(rho)
    values = list(per.values())
    return {"mean": float(np.mean(values)) if values else None, "targets": len(values), "per_target": per}
