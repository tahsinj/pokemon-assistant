import numpy as np

from eval.metrics import brier, calibration, log_loss, spearman_by_target


def test_constant_half_scores():
    win = np.array([0.0, 1.0, 0.5])
    p = np.full(3, 0.5)
    assert np.isclose(log_loss(p, win), np.log(2))
    assert np.isclose(brier(p, win), (0.25 + 0.25 + 0) / 3)


def test_calibration_bins_cover_every_prediction():
    p = np.linspace(0, 1, 101)
    assert sum(b["n"] for b in calibration(p, p)) == 101


def test_spearman_by_target():
    targets = ["X"] * 4 + ["Y"] * 4 + ["Z"] * 2
    smogon = np.array([0.4, 0.3, 0.2, 0.1, 0.4, 0.3, 0.2, 0.1, 0.5, 0.4])
    pred = np.array([0.9, 0.8, 0.7, 0.6, 0.6, 0.7, 0.8, 0.9, 0.5, 0.5])
    r = spearman_by_target(targets, smogon, pred)
    assert r["targets"] == 2
    assert np.isclose(r["per_target"]["X"], 1.0)
    assert np.isclose(r["per_target"]["Y"], -1.0)
