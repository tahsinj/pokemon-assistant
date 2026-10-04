# STAB Lab work plan

Everything left to do, in order, as tasks small enough to pick up cold.
[SPEC.md](SPEC.md) explains why each piece exists; this file says what to
build, where, and how to tell it is done. Tick the boxes as tasks land and
keep the "Status" line of each milestone current.

M0, M1 and M2 are done (see the Status list in SPEC.md section 7). Next up is
M3.

## 0. Before you start

### Rules

- Follow [CONTRIBUTING.md](../CONTRIBUTING.md): commit author, no trailers, no
  tool or assistant names anywhere (branches, commits, files, comments, docs),
  writing rules for comments and docs. Work on `main`.
- Decisions in SPEC.md section 9 are settled. Open questions for the owner are
  in section 7 below; don't decide those silently.
- Push after each finished task so work is never only local.

### Checks

```bash
npm run check     # eslint, prose lint, CSS lint, typecheck, vitest
npm run test:ui   # Playwright, every page at 1100x700 and 1920x1080
npm run build     # renderer and electron builds
```

CI (`.github/workflows/ci.yml`) runs `check` + `build` in one job and the UI
tests in another, and uploads screenshots. Both must stay green.

### Environment notes

- `smogon.com` and `data.pkmn.cc` may be blocked in sandboxes. The data
  scripts read the [pkmn/smogon](https://github.com/pkmn/smogon) mirror and
  PokeAPI CSVs from `raw.githubusercontent.com` instead.
- If Chromium is preinstalled for Playwright (a `PLAYWRIGHT_BROWSERS_PATH` is
  set), don't run `playwright install`.
- `scripts/lint-prose.mjs` must stay ASCII: write its regexes with `\u`
  escapes, never the literal characters.

### Map of the code

| Path | What |
| --- | --- |
| `src/main/` | Electron main: SQLite (`rivalsDb.ts`, `dbSchema.ts`), sprite cache, userData migration |
| `src/shared/speciesId.ts` | Species id normalization, shared by main and renderer |
| `src/renderer/src/App.tsx` | Home screen, area bar, format picker, page routing |
| `src/renderer/src/lib/areas.ts` | Areas, tools and their one name each. Add new tools here |
| `src/renderer/src/lib/formats.ts`, `data.ts` | Format profiles and the per-format data view |
| `src/renderer/src/lib/battle/` | Calc wrapper (`damage.ts`), homegrown battle state (`events.ts`, `state.ts`), search and predictor |
| `src/renderer/src/pages/` | One file per tool |
| `src/renderer/src/styles.css` | The only stylesheet; tokens at the top |
| `scripts/` | `build-dex`, `fetch-usage`, `lint-prose`, `lint-css` |
| `tests/ui/` | Playwright: `stub.ts` (fake preload), `checks.ts` (layout checks), specs |

### Gotchas already paid for

- `@pkmn/sim` clones: `State.serializeBattle`, then deserialize from a JSON
  string. Deserializing the object shares the `log` array with the original
  and eventually trips the engine's line limit.
- Engine speed (Node 22, one core): about 65 ms per random battle, 1.7 ms per
  clone, 2.3 ms per clone plus one turn.
- Abilities and learnset moves are stored as ids. Show them through
  `lib/displayNames.ts` (`abilityName`, `moveName`, `speciesParts`).
- Tailwind theme colors are CSS variables; opacity modifiers work through
  `color-mix` (see `tailwind.config.js`). Don't write `text-[var(--x)]`.
- Plain page buttons get a default skin from `styles.css` at class-level
  specificity. Small icon buttons need `p-0`.
- New UI needs `data-ui` hooks where the layout checks look (`page-title`,
  `page-actions`, `species-row`, `species-name`, `ability`).

## 1. M3: Engine

Goal: battles run on the real Showdown engine. Practice battles against bots,
replay review, and the calc extras from SPEC 5.4. Acceptance is SPEC 5.2 and
5.3.

Status: not started.

### 1.1 Dependencies

- [ ] Move `@pkmn/sim` from devDependencies to dependencies.
- [ ] Add `@pkmn/protocol`, `@pkmn/client` and `@pkmn/randoms` (match the
  `@pkmn/sim` release line).
- [ ] Check `@smogon/calc` for a 0.12 release and upgrade if it exists; run
  the calc tests.

### 1.2 Engine module and worker

- [ ] `src/renderer/src/engine/`: a plain module that wraps `BattleStream`
  with a small API: `start({ format, p1Team, p2Team, seed })`, `choose(side,
  choice)`, `request(side)`, `clone()` (JSON round trip), `log()`. No DOM, so
  vitest can drive it directly.
- [ ] `engine/simWorker.ts`: the same API over `postMessage`, loaded with
  `new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' })`.
- [ ] Teams go in as Showdown export text and are packed with the sim's
  `Teams` helpers; validate with `TeamValidator` for the active format.
- Done when: a vitest plays 50 seeded random-vs-random `gen9ou` battles to the
  end, and their logs match the same seeds run straight through `@pkmn/sim`
  (the parity test from SPEC 5.2). The worker loads in `npm run build` output.

### 1.3 Client state

- [ ] Feed protocol lines into a `@pkmn/client` `Battle` per side.
- [ ] Adapter from client state to what `lib/battle/predictor/` and
  `search/explain.ts` read, so both keep working on the new state.
- Done when: predictor and explain tests pass against client state built
  from a recorded log.

### 1.4 Bots

- [ ] `engine/bots/`: `interface Bot { choose(request, view): Promise<string> }`.
- [ ] Level 0 Random: the sim's random player.
- [ ] Level 1 Greedy: highest expected damage this turn by the calc; switch
  out of a guaranteed KO.
- [ ] Level 2 Search: expectimax, first ply on the real engine (clone per
  joint action), second ply on the calc model, opponent sets sampled from the
  predictor, chance nodes for damage roll buckets, crits and accuracy. Time
  budget per move (default 1.5 s), runs in the worker.
- [ ] `npm run bots:gauntlet` (`scripts/bots-gauntlet.mjs`): round robin over
  a fixed team list, Elo with confidence intervals, writes
  `docs/bot-elo.md`.
- Done when: level 1 beats level 0 at least 90% and level 2 beats level 1 at
  least 65% over 500 games each; a short gauntlet (about 100 games per
  pairing) runs in CI and fails on a regression.

### 1.5 Practice page

- [ ] New tool `practice` ("Practice") in the Battle area (`lib/areas.ts`,
  `App.tsx`).
- [ ] Setup: your team from a saved team, the box, a Showdown paste, a random
  team (`@pkmn/randoms`) or a meta sample; opponent the same plus bot level.
- [ ] Battle view: both actives with HP bars and status, your bench, move and
  switch buttons built from the request, the turn log in plain sentences.
- [ ] Hint: level 2's top three actions with `explain.ts` text.
- [ ] Take back one turn (snapshot each turn), eval graph per turn, export
  the log as a Showdown replay file.
- [ ] UI tests: start a random battle against level 0 and play it to the end
  by always choosing the first legal option; all layout checks pass.
- Done when: a full 6v6 Gen 9 OU battle against levels 0 to 2 plays to the
  end with no desyncs.

### 1.6 Replay review (replaces the Battle Tracker)

- [ ] New tool `replays` ("Replay Review") in the Battle area.
- [ ] Input: a replay URL (fetch `https://replay.pokemonshowdown.com/<id>.json`),
  or a dropped `.log` / `.html` file. Parse with `@pkmn/protocol` into the
  client state; step turn by turn in the practice battle view.
- [ ] Review: run level 2 on the chosen side's decisions and flag turns where
  the choice was much worse than the best one, plus the eval graph.
- [ ] Manual entry writes protocol lines for battles played elsewhere.
- [ ] Then delete `pages/BattleSessionPage.tsx`, `lib/battle/events.ts`,
  `state.ts`, `stateBridge.ts` and `search/simulate.ts`. Port or delete their
  tests, and say which in the commit message.
- Done when: a saved Gen 9 OU replay loads, steps to the end, and the review
  flags at least one turn on a log with a known blunder.

### 1.7 Calc extras (SPEC 5.4)

- [ ] Golden tests: 30 calcs from `@smogon/calc`'s own test suite through
  `lib/battle/damage.ts`, including id-form inputs (`choiceband`,
  `roughskin`).
- [ ] Roll histogram for the selected move and KO chance after hazards and
  end-of-turn damage.
- [ ] "Send to practice": start a battle from the two rosters on screen.

### 1.8 Wrap up

- [ ] README: practice and replay review in the features list.
- [ ] SPEC.md status: M3 done with notes, like M2's.

## 2. M4: Counters v2

Goal: counters come from simulated battles and a learned matchup model.
Acceptance is the metrics in SPEC 5.5, published in a model card.

Status: not started. Needs M3's engine and level 2 bot.

### 2.1 Simulation data (`tools/simgen/`)

- [ ] Node package using the M3 engine module under `worker_threads`.
- [ ] Sample set pairs from the usage data per format, plus off-meta variants
  (odd EVs, weaker moves, no item) so casual boxes get sensible scores.
- [ ] 1v1 battles: a custom format with one Pokémon per side, level 2 bots on
  both sides, several games per pairing.
- [ ] Output JSONL: both sets, win, HP left, turns, forced out, plus the calc
  features computed in TypeScript (SPEC 6.3: Python never re-implements
  mechanics).

### 2.2 Matchup model (`ml/`)

- [ ] Python project: uv, Python 3.12, polars, LightGBM, onnx. Folders
  `ingest/`, `features/`, `train/`, `eval/`, `export/`.
- [ ] Logistic regression baseline, then LightGBM. Metrics: log loss, Brier,
  Spearman against Smogon checks and counters.
- [ ] Export `model.onnx`, `metrics.json`, `MODEL_CARD.md` per format.

### 2.3 Model runtime and packs

- [ ] ML worker with `onnxruntime-web`, models loaded lazily per tool.
- [ ] Data packs (SPEC 5.1): `packs.json` manifest on this repo's GitHub
  Releases with sizes and SHA-256, downloaded into userData, checked at most
  once a day, works offline with the last download.
- [ ] Every ML result says whether the model or the heuristic produced it;
  the heuristic stays as the fallback.

### 2.4 Counter Draft v2

- [ ] Score each box mon against each opponent with the matchup model; greedy
  plus swap pick of 6 with the shared-weakness penalty.
- [ ] Verify: 200 games of the drafted team against the opponent team with
  level 2 bots, shown as a win rate with a confidence interval.
- [ ] Remove the Dynamax toggle (neither format allows Dynamax).
- [ ] Move the Pokédex counters tab into the Counters area.

### 2.5 Raid planner

- [ ] New tool `raid` ("Raid Planner") in the Counters area.
- [ ] `RaidRules` from SPEC 5.5.3 with Normal, Tough and Brutal presets; every
  knob editable.
- [ ] Quick estimate from the calc per box mon; simulated ranking through a
  custom format that applies the HP multiplier and boosts.
- [ ] Output: ranked counters with the best moveset and what to change.

## 3. M5: Team builder v2

Goal: build teams from the box with a learned team model. Acceptance is the
Classic vs model comparison in the README.

Status: not started.

- [ ] Replay ingestion (`ml/ingest/`): check and record each dataset's
  license first (SPEC 6.1); keep derived data only; time split by month.
- [ ] Team model: logistic regression on species and pairs, then the set
  transformer from SPEC 5.6, with both ratings as inputs set equal at
  inference. Metrics: AUC and calibration on a later month.
- [ ] Meta score: mean predicted win rate against about 500 sampled meta
  teams; replaces the weighted sum in `lib/bestSix.ts`.
- [ ] Box search: legal candidates only, beam search (width about 64) plus
  single swaps, three diverse results.
- [ ] Add list: species not in the box that raise the best team's meta score
  most, with the reason.
- [ ] Explanations: per-member contribution, worst meta matchups. Classic
  stays as the fallback and as an option.
- [ ] Proof: Classic vs model teams, 500 simulated games each against meta
  teams with level 2 bots; result with a confidence interval in the README.

## 4. M6: Bots v2

Status: not started.

- [ ] Level 3: information-set MCTS with determinization (hidden sets sampled
  from the predictor), time-boxed, on a small worker pool.
- [ ] Post-game review polish: clearer flagged turns, principal variation.
- [ ] Full gauntlet in CI on a schedule; Elo table in the README.
- [ ] Level 4 (stretch): policy and value network by behavior cloning on
  high-rated replays, exported to ONNX, used as priors in MCTS.

## 5. Cleanup backlog

Small items, any time. Each is one commit.

- [ ] Rename `src/main/rivalsDb.ts` and the `rivals-assistant.sqlite` file to
  STAB Lab names. The file rename needs a migration step next to
  `userDataMigration.ts`, with a test.
- [ ] Shared components from SPEC 5.8 that don't exist yet (`DataTable`,
  `Toolbar`, `Field`, `Panel`) as the M3 pages need them. `Field` should
  replace the three overlapping input skins in `styles.css` (`.ds input`,
  `.dive-content input`, `.hud-form input`).
- [ ] Home screen focus card (`FocusLens`) still uses 11-13px mono labels.
- [ ] `scripts/bench-recommend.mjs`: make sure it still runs, or delete it
  with the old search code in 1.6.
- [ ] Bump the version in `package.json` when cutting a release (the home
  screen reads it).
- [ ] SPEC.md section 2.1 still describes the old twelve tools; it is the
  audit, so leave it, but don't copy from it.

## 6. Platform

- [ ] Windows installer check after M3 (`npm run pack:win`): the sim worker
  and fonts load from the packaged app.
- [ ] macOS and Linux builds (SPEC 9: later).
- [ ] Usage history: keep several months per format and show trends in Meta
  ("Kingambit up 3% since last month"), on top of the packs from 2.3.

## 7. Open questions for the owner

- The PC Box has "TR planning" (`lib/pc/trPriority.ts`, `trAssign.ts`).
  Technical Records are a Sword and Shield item and mean nothing on Showdown.
  Remove it, or reword it as "moves to teach"?
- Fetch Smogon sample sets at runtime instead of bundling their move lists
  and spreads?
- Rename the GitHub repo to `stab-lab`?
- Which bot level should Practice default to (suggested: level 2)?
