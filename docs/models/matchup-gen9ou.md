# Matchup model: Gen 9 OU

Predicts how likely set A is to beat set B one on one in Gen 9 OU
(`gen9ou`), from the features in `src/renderer/src/ml/matchupFeatures.ts`.
Trained 2026-10-09 by `ml/train/matchup.py`.

## Data

- Source: our own simulations (`npm run simgen`, `tools/simgen`): 20000 set
  pairs, 4 games each with the Search bot on both sides, sides swapped
  every other game. About 26% of sets carry an off-meta change.
- Sets are drawn from the format's usage statistics (Smogon, public domain)
  and the move lists and spreads of Smogon's sample sets, as bundled in the
  app. No replays or third-party datasets are used, so no dataset license
  applies.
- Split: 16390 pairs to train, 3610 held out; a species
  pairing is never on both sides of the split. Every pair is also used
  mirrored (B against A).

## Metrics (held-out pairs)

Log loss and Brier score are against each pair's simulated win rate.
Spearman is the rank correlation between Smogon's checks and counters
scores and the model's win chance for those checks, averaged over
48 species with three or more listed checks. "Checks win" is the
mean predicted win chance of a listed check against its target (0.5 would
mean the model sees no edge).

| Model | Log loss | Brier | Spearman | Checks win |
| --- | --- | --- | --- | --- |
| LightGBM | 0.5715 | 0.1219 | 0.075 | 0.760 |
| Logistic regression | 0.6197 | 0.1411 | 0.038 | 0.664 |
| Always 0.5 | 0.6931 | 0.1759 | | |

Calibration (LightGBM):

| Predicted | Pairs | Mean predicted | Simulated win rate |
| --- | --- | --- | --- |
| 0.0 to 0.1 | 463 | 0.063 | 0.071 |
| 0.1 to 0.2 | 712 | 0.151 | 0.184 |
| 0.2 to 0.3 | 727 | 0.252 | 0.286 |
| 0.3 to 0.4 | 803 | 0.353 | 0.402 |
| 0.4 to 0.5 | 915 | 0.448 | 0.500 |
| 0.5 to 0.6 | 885 | 0.552 | 0.505 |
| 0.6 to 0.7 | 799 | 0.648 | 0.587 |
| 0.7 to 0.8 | 759 | 0.750 | 0.717 |
| 0.8 to 0.9 | 694 | 0.852 | 0.818 |
| 0.9 to 1.0 | 463 | 0.936 | 0.929 |

## Known limits

- One on one only: no hazards, no teammates, no switching. Team-level
  questions (Counter Draft) combine many of these predictions.
- Labels come from the Search bot playing both sides, so the model learns
  how that bot plays, not how people do.
- Sets are fixed per game; no in-battle team preview reasoning.
- Smogon's checks and counters come from team battles, so they measure
  something wider than a one-on-one; the Spearman number is a sanity check,
  not a target.
