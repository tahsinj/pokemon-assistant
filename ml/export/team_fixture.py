"""An untrained team model for the app's tests, with the real inputs, a
small vocabulary and a small meta, so the team model runtime can be
exercised without a downloaded pack.

Usage: uv run --group train python -m export.team_fixture
"""

import json
from pathlib import Path

import torch

from features.team import SLOTS
from train.team import TeamModel

FIXTURES = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"
SPECIES = ["garchomp", "corviknight", "gholdengo", "greattusk", "kingambit", "dragapult", "toxapex", "clefable", "heatran", "rotomwash"]


def main() -> None:
    torch.manual_seed(0)
    vocab = {"<pad>": 0, "<unk>": 1, **{f"s:{s}": i + 2 for i, s in enumerate(SPECIES)}}
    model = TeamModel(len(vocab), dim=8, heads=2).eval()
    sample = torch.zeros((1, 6, SLOTS), dtype=torch.int64)
    torch.onnx.export(model, (sample, sample, torch.zeros((1, 2))), str(FIXTURES / "team-tiny.onnx"),
                      input_names=["team_a", "team_b", "ratings"], output_names=["win"],
                      dynamic_axes={"team_a": {0: "n"}, "team_b": {0: "n"}, "ratings": {0: "n"}, "win": {0: "n"}},
                      opset_version=17, dynamo=False)
    (FIXTURES / "team-vocab-tiny.json").write_text(json.dumps({"slots": SLOTS, "tokens": vocab}))
    meta = [{"species": SPECIES[i:i + 6], "revealed": {}} for i in range(0, 5)]
    (FIXTURES / "meta-teams-tiny.json").write_text(json.dumps({"month": "2026-09", "teams": meta}))
    print(f"Wrote the team model fixtures to {FIXTURES}")




if __name__ == "__main__":
    main()
