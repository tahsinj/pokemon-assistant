"""A tiny matchup model for the app's tests: same inputs as the real one,
a few trees trained on made-up data, so the runtime can be exercised
without a downloaded pack. The team model's fixture is export/team_fixture.py
(LightGBM and PyTorch can deadlock when loaded in one process).

Usage: uv run python -m export.fixture
"""

from pathlib import Path

import lightgbm as lgb
import numpy as np

from export.onnx import export_lightgbm
from ingest.sim import feature_names

FIXTURES = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
OUT = FIXTURES / "matchup-tiny.onnx"


def main() -> None:
    names = feature_names("gen9ou")
    rng = np.random.default_rng(0)
    x = rng.normal(size=(400, len(names)))
    # Learns "more hits_diff, more wins", which the tests can check for.
    y = (x[:, names.index("hits_diff")] > 0).astype(int)
    model = lgb.LGBMClassifier(n_estimators=8, num_leaves=4, random_state=0, verbose=-1).fit(x, y)
    export_lightgbm(model, len(names), OUT, x[:50])
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
