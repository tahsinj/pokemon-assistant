# Team model: Gen 9 OU

Predicts how likely team A is to beat team B in Gen 9 OU (`gen9ou`), from
each team's six species, the information a player has before the game. Trained 2026-10-13 by `ml/train/team.py`.

Revealed moves and items are left out on purpose: replays reveal them over
the whole game, and the winner tends to show more of its sets, so a model
that reads them partly learns the result (an AUC of 0.62 here, against 0.53
for species alone on the same month).

## Data

- Source: public replays from Showdown's replay server
  (replay.pokemonshowdown.com), fetched through its JSON API one request a
  second (`ml/ingest/replays.py`). Rated games of 1300 and up, 13093 usable
  games across 2026-07, 2026-08, 2026-09, 2026-10. Raw logs stay in a local cache; only
  derived data (teams, ratings, winner, revealed sets) is used, and only the
  trained weights and a list of meta teams ship.
- Split by time: 9995 games before 2026-10 to train (a tenth of them to
  stop training), 3098 games from 2026-10 held out.

## Metrics (2026-10, held out)

Player ratings are inputs during training and set equal for scoring teams,
as the app does.

| Model | AUC | Log loss | Brier |
| --- | --- | --- | --- |
| Set transformer, real ratings | 0.528 | 0.6923 | 0.2496 |
| Set transformer, equal ratings | 0.528 | 0.6923 | 0.2496 |
| Set transformer, species only | 0.528 | 0.6923 | 0.2496 |
| Logistic regression on species | 0.526 | 0.7091 | 0.2568 |

For reference, FutureSightML reports a pre-game AUC of 0.726 on Gen 9 OU.

Calibration (set transformer, equal ratings):

| Predicted | Games | Mean predicted | Win rate |
| --- | --- | --- | --- |
| 0.4 to 0.5 | 1556 | 0.478 | 0.463 |
| 0.5 to 0.6 | 1542 | 0.522 | 0.516 |

## Known limits

- Ladder games at 1300 and up only; low-usage species have few examples, so
  their tokens are weak or unknown.
- Species alone say little about who wins a single game: the pilot and the
  sets matter more. The model is a weak signal (AUC barely above 0.5), so
  the proof below, which plays the teams out, is the better guide.
- About 13,000 games is small for this task; more months of replays should
  help.
