# ml

Training, evaluation and ONNX export for STAB Lab's models (SPEC section 6).
The app only loads the exported ONNX files; nothing here runs at runtime.

```
ingest/    read simulation data (tools/simgen output)
features/  model inputs: mirroring and soft labels, never game mechanics
train/     one script per model
eval/      metrics
export/    ONNX export with a parity check, model cards
tests/     pytest
```

Features are computed in TypeScript (`src/renderer/src/ml/matchupFeatures.ts`)
when the data is generated, so the app and the training code always agree.

## Matchup model

```bash
# from the repo root: simulated one-on-one games and Smogon check rows
npm run simgen -- --format gen9ou --pairs 20000 --games 4
npm run simgen -- --checks --format gen9ou

# from ml/
uv sync
uv run python -m train.matchup --format gen9ou
uv run --group dev pytest
```

Training writes `data/models/<format>/matchup.onnx`, `metrics.json` and
`MODEL_CARD.md` (not committed; they ship as release assets), and copies the
card to `docs/models/matchup-<format>.md`.
