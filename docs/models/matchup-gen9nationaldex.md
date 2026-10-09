# Matchup model: National Dex OU

Predicts how likely set A is to beat set B one on one in National Dex OU
(`gen9nationaldex`), from the features in `src/renderer/src/ml/matchupFeatures.ts`.
Trained 2026-10-09 by `ml/train/matchup.py`.

## Data

- Source: our own simulations (`npm run simgen`, `tools/simgen`): 10000 set
  pairs, 4 games each with the Search bot on both sides, sides swapped
  every other game. About 25% of sets carry an off-meta change.
- Sets are drawn from the format's usage statistics (Smogon, public domain)
  and the move lists and spreads of Smogon's sample sets, as bundled in the
  app. No replays or third-party datasets are used, so no dataset license
  applies.
- Split: 8099 pairs to train, 1901 held out; a species
  pairing is never on both sides of the split. Every pair is also used
  mirrored (B against A).

## Metrics (held-out pairs)

Log loss and Brier score are against each pair's simulated win rate.
Spearman is the rank correlation between Smogon's checks and counters
scores and the model's win chance for those checks, averaged over
62 species with three or more listed checks. "Checks win" is the
mean predicted win chance of a listed check against its target (0.5 would
mean the model sees no edge).

| Model | Log loss | Brier | Spearman | Checks win |
| --- | --- | --- | --- | --- |
| LightGBM | 0.5074 | 0.1136 | -0.119 | 0.802 |
| Logistic regression | 0.5792 | 0.1412 | -0.031 | 0.707 |
| Always 0.5 | 0.6931 | 0.1935 | | |

Calibration (LightGBM):

| Predicted | Pairs | Mean predicted | Simulated win rate |
| --- | --- | --- | --- |
| 0.0 to 0.1 | 465 | 0.057 | 0.062 |
| 0.1 to 0.2 | 401 | 0.150 | 0.179 |
| 0.2 to 0.3 | 378 | 0.248 | 0.287 |
| 0.3 to 0.4 | 310 | 0.350 | 0.402 |
| 0.4 to 0.5 | 347 | 0.451 | 0.452 |
| 0.5 to 0.6 | 336 | 0.551 | 0.528 |
| 0.6 to 0.7 | 304 | 0.648 | 0.637 |
| 0.7 to 0.8 | 398 | 0.750 | 0.692 |
| 0.8 to 0.9 | 400 | 0.849 | 0.819 |
| 0.9 to 1.0 | 463 | 0.944 | 0.941 |

## Known limits

- One on one only: no hazards, no teammates, no switching. Team-level
  questions (Counter Draft) combine many of these predictions.
- Labels come from the Search bot playing both sides, so the model learns
  how that bot plays, not how people do.
- Sets are fixed per game; no in-battle team preview reasoning.
- Smogon's checks and counters come from team battles, so they measure
  something wider than a one-on-one; the Spearman number is a sanity check,
  not a target.
