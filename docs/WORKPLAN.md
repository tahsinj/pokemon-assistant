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
| `src/main/` | Electron main: SQLite (`db.ts`, `dbSchema.ts`), sprite cache, userData migration |
| `src/shared/speciesId.ts` | Species id normalization, shared by main and renderer |
| `src/renderer/src/App.tsx` | Home screen, area bar, format picker, page routing |
| `src/renderer/src/lib/areas.ts` | Areas, tools and their one name each. Add new tools here |
| `src/renderer/src/lib/formats.ts`, `data.ts` | Format profiles and the per-format data view |
| `src/renderer/src/engine/` | Simulator wrapper, bots, practice session, client state (`clientState.ts`, `clientSpec.ts`), set tracking (`setTracker.ts`), replays |
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
- The simulator in the browser needs `define: { global: 'globalThis' }` and
  `esbuild: { keepNames: true }` in `vite.config.ts`: battle cloning finds
  objects by class name, and minified names break it (only in production
  builds, so the UI tests catch it and vitest does not).
- Never `pkill -f` a pattern that also appears in the command you run; it
  kills its own shell. Match on the process's own argv instead.
- New UI needs `data-ui` hooks where the layout checks look (`page-title`,
  `page-actions`, `species-row`, `species-name`, `ability`).

## 1. M3: Engine

Goal: battles run on the real Showdown engine. Practice battles against bots,
replay review, and the calc extras from SPEC 5.4. Acceptance is SPEC 5.2 and
5.3.

Status: mostly done. Engine, bots 0 to 2 with a gauntlet, Practice with
hints, Replay Review, the calc extras and the predictor on client state
work, and Search plans with sampled foe sets instead of the real ones. Left:
hint explanations (1.5), manual entry and retiring the Battle Tracker (1.6),
and a Windows installer check (section 6).

### 1.1 Dependencies

- [x] Move `@pkmn/sim` from devDependencies to dependencies.
- [x] Add `@pkmn/protocol`, `@pkmn/client`, `@pkmn/data` and `@pkmn/randoms`.
- [x] Upgrade `@smogon/calc` to 0.12.

### 1.2 Engine module and worker

- [x] `src/renderer/src/engine/engine.ts`: `Engine` wraps the sim's `Battle`
  (start, request, needsChoice, choose, clone, linesFor, inputLog) plus
  `playOut`, `packTeam`, `validateTeam`, `randomTeam`, `seedFrom`. No DOM.
- [x] `engine/session.ts` (player vs bot, take-back snapshots) behind
  `engine/practice.worker.ts` and `engine/practiceClient.ts`, which falls
  back to running in the page if the worker fails.
- [x] Teams go in as Showdown export text; `validateTeam` uses the sim's
  `TeamValidator`.
- Done when: a vitest plays 50 seeded random-vs-random `gen9ou` battles to the
  end, and their logs match the same seeds run straight through `@pkmn/sim`
  (the parity test from SPEC 5.2). The worker loads in `npm run build` output.

### 1.3 Client state

- [x] Feed protocol lines into a `@pkmn/client` `Battle`
  (`engine/clientState.ts`); the Practice page renders from it.
- [x] Adapter from client state to what `lib/battle/predictor/` and
  `search/explain.ts` read, so both keep working on the new state.
  `engine/setTracker.ts` walks protocol lines and keeps a predictor model
  per foe Pokémon (reveals always, damage rolls when your own sets are
  known); `engine/clientSpec.ts` builds calc inputs and the field from
  client state. The predictor and explain no longer import the old state.
- Done when: predictor and explain tests pass against client state built
  from a recorded log. `engine/setTracker.test.ts` plays 30 seeded battles
  with the real foe sets in the pool and checks the real set is never ruled
  out (also run once over 1300 games from both seats, with no misses).

### 1.4 Bots

- [x] `engine/bots/bot.ts`: `interface Bot { choose(engine, side, request): string }`.
  Bots see their own sets in full and only public info about the foe
  (`bots/view.ts`).
- [x] Level 0 Random (`bots/random.ts`, seeded).
- [x] Level 1 Greedy (`bots/greedy.ts`): beats Random in at least 85% of 40
  games (`bots/bots.test.ts`). `bots/match.ts` plays bot-vs-bot series.
- [x] Level 2 Search (`bots/search.ts`): one ply on the real engine, each
  action against the foe's top replies, two roll samples each, scored by
  Pokémon left and HP. About 0.1 to 0.3 s per decision.
- [x] Level 2 no longer sees the foe's real sets. It tracks the battle from
  its own seat (`setTracker.ts`) and searches copies where each foe
  Pokémon's unrevealed moves, item, ability, spread and Tera type are drawn
  from the predictor (`bots/determinize.ts`); priors are the random battle
  roles (`bots/setPool.ts`) plus the format's usage sets in Practice. A
  calc-based second ply estimates the next exchange. The hint searches from
  your seat the same way, so it no longer sees the bot's sets. About 50 ms
  per decision; Search beat Greedy 47 of 60 in a first check.
- [x] `npm run bots:gauntlet` writes `docs/bot-elo.md`; the `Bot gauntlet`
  workflow runs 60 games per pairing weekly and on bot changes.
- Result (100 games each, [bot-elo.md](bot-elo.md)): Greedy beats Random 96%,
  Search beats Greedy 72%, Search beats Random 99%. The spec asks for 500
  games; run `npm run bots:gauntlet -- --games 500` (about 1.5 hours).

### 1.5 Practice page

- [x] New tool `practice` ("Practice") in the Battle area.
- [x] Setup: your team from a saved team, the Team Builder, a paste, a meta
  sample (`engine/metaTeam.ts`) or a random team; opponent from a meta
  sample, a saved team or a random team; bot level.
- [x] Battle view: both actives with HP, status, boosts and Tera, move and
  switch buttons from the request, the log in sentences (`engine/describe.ts`).
- [x] Take back one turn; save the log; rematch.
- [x] UI test (`tests/ui/practice.spec.ts`) plays a battle to the end.
- [x] Hint: the Search bot's three best actions; click one to play it.
- [x] Position graph per turn.
- [x] Add the box (PC) as a team source ("Best of box", the Team Builder's
  balanced pick).
- [ ] Hint explanations (threats, assumptions) once level 2 uses the
  predictor.
- Done when: a full 6v6 Gen 9 OU battle against levels 0 to 2 plays to the
  end with no desyncs.

### 1.6 Replay review (replaces the Battle Tracker)

- [x] New tool `replays` ("Replay Review") in the Battle area
  (`pages/ReplayPage.tsx`, `engine/replay.ts`, `engine/review.ts`).
- [x] Input: a replay link (fetches `<id>.json`; if CORS blocks it, the user
  saves the page and opens the file), a saved replay page, its JSON, or a
  Practice log. Steps turn by turn with the shared battle view.
- [x] Review from public information: flags turns where a clearly stronger
  revealed move (or a likely KO) was passed up; position graph.
- [ ] Review with the search bot needs a simulator state rebuilt from the
  replay (teams from what was revealed plus usage sets). Not started.
- [ ] Manual entry writes protocol lines for battles played elsewhere.
- [ ] Then delete `pages/BattleSessionPage.tsx`, `lib/battle/events.ts`,
  `state.ts`, `stateBridge.ts` and `search/simulate.ts`. Port or delete their
  tests, and say which in the commit message.
- Done when: a saved Gen 9 OU replay loads, steps to the end, and the review
  flags at least one turn on a log with a known blunder.

### 1.7 Calc extras (SPEC 5.4)

- [x] Golden tests (`lib/battle/damage.golden.test.ts`): 30 calcs through the
  wrapper with id-form inputs match `@smogon/calc` called directly. They
  caught species ids disabling Soul Dew, Thick Club and similar effects.
- [x] Roll histogram for a move (click its damage), with the calc's KO text,
  which includes hazards set in the field bar.
- [x] "Send to practice" starts Practice with the two rosters against the
  Search bot.

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

- [x] `src/main/rivalsDb.ts` is `src/main/db.ts`, and the database is
  `stab-lab.sqlite`; an old `rivals-assistant.sqlite` is renamed on start
  (`renameLegacyDb`, tested).
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

- [x] `npm run test:electron` (CI job `electron`, under Xvfb) loads the built
  app from disk in Electron and starts a practice battle: the module worker
  works over `file://`.
- [ ] Build the Windows installer (`npm run pack:win`, needs Windows or Wine)
  and try it once by hand.
- [ ] macOS and Linux builds (SPEC 9: later).
- [ ] Usage history: keep several months per format and show trends in Meta
  ("Kingambit up 3% since last month"), on top of the packs from 2.3.

## 7. Open questions for the owner

Decided so far: the PC Box's TR planning became "Moves to teach", limited to
moves learnable in the selected format with a format toggle in the panel;
Practice defaults to the Search bot.

- Fetch Smogon sample sets at runtime instead of bundling their move lists
  and spreads?
- Rename the GitHub repo to `stab-lab`?
