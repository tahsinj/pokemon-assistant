"""ONNX export with a parity check, and the model card."""

from pathlib import Path

import numpy as np
import onnxruntime as ort
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType


def export_lightgbm(model, n_features: int, path: Path, sample: np.ndarray) -> None:
    """Write the classifier as ONNX (input "features", float [N, F]) and check it
    gives the same win chances as LightGBM itself."""
    onx = convert_lightgbm(model, initial_types=[("features", FloatTensorType([None, n_features]))],
                           zipmap=False, target_opset=15)
    # The converter declares a batch of one for the label output; make it follow the input.
    for output in onx.graph.output:
        dims = output.type.tensor_type.shape.dim
        if dims:
            dims[0].ClearField("dim_value")
            dims[0].dim_param = "N"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(onx.SerializeToString())
    options = ort.SessionOptions()
    options.log_severity_level = 3
    session = ort.InferenceSession(str(path), options)
    got = session.run(None, {"features": sample.astype(np.float32)})[1][:, 1]
    want = model.predict_proba(sample)[:, 1]
    gap = float(np.abs(got - want).max())
    if gap > 1e-4:
        raise RuntimeError(f"ONNX output differs from LightGBM by {gap}")


def model_card(fmt: str, m: dict) -> str:
    def row(name: str, r: dict) -> str:
        return f"| {name} | {r['log_loss']:.4f} | {r['brier']:.4f} | {r['spearman']['mean']:.3f} | {r['checks_mean_win']:.3f} |"

    cal = "\n".join(f"| {c['from']:.1f} to {c['to']:.1f} | {c['n']} | {c['predicted']:.3f} | {c['actual']:.3f} |"
                    for c in m["lightgbm"]["calibration"])
    d = m["data"]
    return f"""# Matchup model: {m['label']}

Predicts how likely set A is to beat set B one on one in {m['label']}
(`{fmt}`), from the features in `src/renderer/src/ml/matchupFeatures.ts`.
Trained {m['trained']} by `ml/train/matchup.py`.

## Data

- Source: our own simulations (`npm run simgen`, `tools/simgen`): {d['pairs']} set
  pairs, {d['games']} games each with the Search bot on both sides, sides swapped
  every other game. About {d['offmeta']:.0%} of sets carry an off-meta change.
- Sets are drawn from the format's usage statistics (Smogon, public domain)
  and the move lists and spreads of Smogon's sample sets, as bundled in the
  app. No replays or third-party datasets are used, so no dataset license
  applies.
- Split: {d['train_pairs']} pairs to train, {d['test_pairs']} held out; a species
  pairing is never on both sides of the split. Every pair is also used
  mirrored (B against A).

## Metrics (held-out pairs)

Log loss and Brier score are against each pair's simulated win rate.
Spearman is the rank correlation between Smogon's checks and counters
scores and the model's win chance for those checks, averaged over
{m['lightgbm']['spearman']['targets']} species with three or more listed checks. "Checks win" is the
mean predicted win chance of a listed check against its target (0.5 would
mean the model sees no edge).

| Model | Log loss | Brier | Spearman | Checks win |
| --- | --- | --- | --- | --- |
{row('LightGBM', m['lightgbm'])}
{row('Logistic regression', m['logistic'])}
| Always 0.5 | {m['constant']['log_loss']:.4f} | {m['constant']['brier']:.4f} | | |

Calibration (LightGBM):

| Predicted | Pairs | Mean predicted | Simulated win rate |
| --- | --- | --- | --- |
{cal}

## Known limits

- One on one only: no hazards, no teammates, no switching. Team-level
  questions (Counter Draft) combine many of these predictions.
- Labels come from the Search bot playing both sides, so the model learns
  how that bot plays, not how people do.
- Sets are fixed per game; no in-battle team preview reasoning.
- Smogon's checks and counters come from team battles, so they measure
  something wider than a one-on-one; the Spearman number is a sanity check,
  not a target.
"""
