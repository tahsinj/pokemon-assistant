# simgen

Generates labelled one-on-one battles for the matchup model (SPEC 5.5.1).

Each record is a pair of sets drawn from a format's usage data, a quarter of
them with an off-meta change (an odd spread, a random learnable move swapped
in, or no item) so casual box Pokémon get sensible scores too. The pair plays
several games in `gen9customgame` with the Search bot on both sides, swapping
sides every other game, and the record keeps:

- `a`, `b`: both sets, packed (Showdown's packed team format)
- `a_species`, `b_species`, `a_variant`, `b_variant`
- `win`: A's mean score (win 1, tie 0.5); games past 60 turns are ties
- `hp_a`, `hp_b`: mean HP share left at the end; in a one-on-one game,
  being forced out means fainting, so `hp_b == 0` says B was knocked out
- `turns`: mean game length
- `features`: `src/renderer/src/ml/matchupFeatures.ts` for A against B, in
  the order of the `.features.json` file written next to the data

```bash
npm run simgen -- --format gen9ou --pairs 20000 --games 4 --workers 8
```

Output goes to `ml/data/sim/<format>.jsonl`, which is not committed. On ten
cores, expect roughly ten pairs a second at four games each.
