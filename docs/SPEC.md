# Pokémon Assistant v2 spec

Status: draft, research only, no code changes yet
Date: 2026-10-03
Owner: Tahsin

This doc has three parts: an audit of the app as it stands, the plan for what it
turns into, and the research behind the plan. Open questions that need a decision
from me are collected in section 9.

## 1. Summary

The app started as a Cobblemon helper. It already does a lot (12 tools, 357
passing tests), but most of the "smart" features run on hand-tuned heuristics,
the battle simulator only models raw damage, and the UI has grown three
competing style systems.

v2 changes five things:

1. **Generalize.** Swap Cobblemon-specific assumptions for "game profiles" so
   the same tools work for Cobblemon, Showdown formats, and the official
   competitive game, with Cobblemon still first-class.
2. **Real battle engine.** Replace the homegrown turn simulator with Pokémon
   Showdown's own engine (`@pkmn/sim`) and use it for practice battles against
   bots of increasing strength.
3. **Counters from data.** Rebuild 1v1 counters, team counters and a new raid
   planner on simulated battles and a learned matchup model, checked against
   Smogon's published checks and counters.
4. **Learned team builder.** Train a team strength model on ladder replays and
   use it to search over the Pokémon actually in your box, plus a "catch list"
   of species worth hunting.
5. **Cleanup.** One design system, fewer and clearer tools, a healthy repo
   (CI, lockfile, no dead code, no AI-sounding comments).

### Non-goals

- Non-Pokémon creature games (Temtem, Palworld, Cassette Beasts, Monster
  Sanctuary). Their battle systems, data and formats share nothing with
  Showdown, so supporting them means writing a second app. The game profile
  layer should not block a plugin later, but nothing is built for them now.
- Online accounts, cloud sync, telemetry. Everything stays local.
- PvP cheating aids. The live tracker only ever uses information the player can
  already see on screen (see 5.7).
- LLM chat features. The ML work here is classic supervised learning and search.

## 2. Where the app is today

### 2.1 Tool inventory

| Hex | Page title | What it does | State |
| --- | --- | --- | --- |
| Pokédex | Field Index | Species browser, stats, coverage and threats, counters tab | Works. Name truncation and raw ability ids (see 2.6) |
| Moves | Move Index | Move browser with reverse learnset | Works |
| Team | Squad Six | Six-slot builder, set editor, best-6-from-PC search | Works. Heuristic scoring, does not load the current team |
| Battle | Damage Calc | Single-target damage calc | Works. Duplicates Calcdex |
| Calcdex | Damage Workbench | Two-roster damage workbench | Works. Duplicates Battle |
| Live | Battle Tracker | Manual battle event log, set prediction, move recommendations | Mostly manual. Simulator gaps make recommendations weak (2.3) |
| EV/IV | Planner | EV/IV planning | Works |
| PC Box | Box 1 | Local PC storage, set review, TR planning | Works |
| Spawns | Biome Atlas | Cobblemon spawn lookup | Works. Cobblemon-only data |
| Breed | Breeding | Breeding odds | Works |
| Meta | Smogon Intel | NatDex OU usage viewer | Works. One format only, layout overflow |
| Draft | Counter Draft | Pick a PC team against a known opponent team | Works. Hand-written win/trade/lose rules |

The home screen is the "Sync Core" orb with 12 hexes around it, a focus card on
the left and the squad rail on the right.

### 2.2 Build and tests

- `npm test`: 39 files, 357 tests, all passing.
- `tsc --noEmit` passes with the pinned TypeScript 5.9. `npx tsc` from a clean
  machine pulls TypeScript 6 and fails on the deprecated `baseUrl` in
  `tsconfig.json`.
- `npm ci` fails: `package-lock.json` is out of sync with `package.json`
  (missing `esbuild@0.28.2` and its platform packages). Any CI or fresh clone
  using `npm ci` breaks today.
- No CI workflow, no linter config.
- `@smogon/calc` is pinned to `^0.11.0`; `0.12.0` is out.

### 2.3 Battle engine

The live tracker and the move recommender run on a homegrown simulator
(`lib/battle/search/simulate.ts`) driven by an expectimax search. Damage numbers
come from `@smogon/calc`, which is correct, but everything around the damage is
approximated:

- Status moves are no-ops. Swords Dance, Will-O-Wisp, Stealth Rock, Roost,
  Protect and Toxic change nothing in the projection, so the search can never
  value setup, recovery, hazards or status.
- No end-of-turn effects: burn, poison, Leftovers, weather chip, hazard damage
  on switch-in (`events.ts` has `TurnEnded` as a no-op).
- No recoil, drain, secondary effects, crits or accuracy. Damage is the average
  roll, so KO thresholds near the edge are judged wrong in both directions.
- Speed ties always go to the player.
- Opponent switches are not modeled.
- Evaluation weights are hand-tuned.

Combined with the fact that every event in the tracker has to be entered by
hand, this is why battles "don't really work". The fix is not to patch the
simulator but to stop maintaining one (5.2).

Calc wrapper (`lib/battle/damage.ts`) findings from a quick probe:

- Abilities are normalized from id form ("levitate") to display names, and
  that works (Earthquake into Levitate Rotom-Wash correctly does 0).
- Items are not normalized. `item: 'choiceband'` is silently ignored: a +Atk
  Choice Band Earthquake from Garchomp into 252 HP Heatran reads 177-209%
  instead of 265-314%. The UI passes display names so it is fine today, but the
  mod bridge forwards whatever the game sends, so id-form items from Cobblemon
  would be dropped.
- The species override path forwards types and weight to the calc but not base
  stats, even though the comment says it does. No current Cobblemon species
  differs from Showdown on base stats, so this is latent, but any custom species
  with real stat changes would calc with the wrong numbers.
- Generation is hard-coded to 9 in 14 places.

### 2.4 Team builder and counters

- **Best 6 from PC** (`lib/bestSix.ts`): greedy fill plus single-swap hill
  climbing over a pool of up to 30 mons, scored by a weighted sum of quality,
  Smogon teammate co-usage, stacked weaknesses, STAB coverage and role checks.
  The weights are three hand-written presets (balanced, offense, defense). It
  is a reasonable heuristic, but nothing measures whether its picks actually
  win more.
- **PC counters** (`lib/pcCounters.ts`): `power x effectiveness x STAB x attack/100`
  plus half a defense term plus 0.2 x speed difference. Magic numbers, no
  validation.
- **Counter Draft** (`lib/counterDraft.ts`, `lib/matchup.ts`): uses real calcs
  for each pairing, then classifies win/trade/lose with fixed rules (outspeed
  and 2HKO, or survive and KO back, or take <=45% and 3HKO). Better than the
  others, but still a rule table, and it never plays the matchups out.
- **Raids**: not supported.

### 2.5 Coupling to one game and one format

- "Cobblemon" appears on 260 lines across 60 files.
- Usage data is a single format: `smogon.json` holds NatDex OU (2026-05, 1630
  cutoff, 478 species). `isNatDexOULegal` is the only legality check. The fetch
  script takes `--format` but the app only reads one bundle.
- Species, learnsets and spawns come from Cobblemon data files (1236 species
  entries including forms).

### 2.6 UI problems

Found by rendering every tool at the default window size (1400x900) with a
stubbed preload:

1. **Header collisions.** Page action buttons (Import / Sync from PC / Save
   Team, Crit Off, MD / TXT / Showdown, the Pokédex type chips, the Spawns
   rule counter) crowd the "ESC · CLOSE" hint and the close button on every
   page that has actions.
2. **Broken frame.** The inner content frame's border stops short at the
   top-right corner on every tool, which reads as a rendering glitch.
3. **Names truncated to nothing.** In the Pokédex and Spawn lists, type chips
   and BST eat the row, leaving "B", "I.", "V", "C..." for species names.
4. **Forms look like duplicates.** Venusaur and Mega Venusaur both render as
   "#0003 Ven...", and Charizard's three rows differ only by types and BST.
   Forms need a label.
5. **Overflow in Smogon Intel.** The spreads column runs past its card ("Relaxed
   8 HP / 252 De"); 12 elements overflow horizontally on that page.
6. **Raw ability ids** in the Pokédex ("overgrow", "chlorophyll (H)") while
   everywhere else uses display names ("Rough Skin").
7. **Team Builder opens empty** even though the home screen shows the saved
   team. You have to load it by hand.
8. **Two damage calculators** with different layouts and names ("Damage Calc"
   and "Damage Workbench").
9. **Live tracker looks like a different app.** 170 inline `style={{}}` blocks,
   plain form inputs, and connection state shown twice ("Mod disconnected" and
   "OFFLINE").
10. **Naming drift.** Each tool has three names: hex label, eyebrow, title.
    Battle / Battle Assistant / Damage Calc. Meta / Smogon / Smogon Intel.
    Spawns / Spawn Locations / Biome Atlas. Pokédex / Pokédex / Field Index.
11. **Small mono caps for body text.** A lot of explanatory copy is 11 to 13 px
    uppercase monospace with wide tracking, which is hard to read.
12. **Three global stylesheets** (`hud.css` 57 KB, `design/design-system.css`
    57 KB, `styles.css` 18 KB) plus Tailwind plus inline styles. 39 z-index
    rules and 70 absolute/fixed positions across them. This is where the
    overlap comes from.

### 2.7 Dead code and repo hygiene

- `pages/DesignSystemPage.tsx` (55 KB) is never routed.
- 8 HUD components are never imported: `AlertStack`, `RecentsLog`,
  `RegionCard`, `StatusTicker`, `ActionDock`, `WorldScanner`, `BridgeChrome`,
  `StatusModule`.
- `lib/hudFixtures.ts` still ships fake data (`HUD_TRAINER` "Kai Nakamura",
  `HUD_ACTIVE`, `HUD_RECENTS`, `HUD_ALERTS`) that nothing reads.
- `db/schema.sql` is not loaded; `src/main/rivalsDb.ts` has its own inline
  schema. The SQL file still says "Cobblemon Rivals Assistant" and defines an
  unused `spawn_index` table.
- The team tag column is `riven_tag` / `rivenTag` (typo for rival).
- `cobblemon-mod/` is a placeholder scaffold: event imports are stubs and it
  says so in its own README. Nothing can actually connect to the game yet.
- AI-sounding writing: there are no em dashes left, but there are other tells.
  Comments that talk about the process instead of the code ("for the MVP",
  "Later phases can...", "option C", "the doc's 'build outward' idea",
  "Honest duplicate-drop", "silence TS unused"), unicode arrows and symbols in
  comments (about 58 arrows, 60 ellipses, 92 multiplication signs, 18 >= signs
  across code and UI strings), long narrated JSDoc on simple code
  (`battle/search/types.ts` is 44% comments), and the "◢" glyph used as a
  decorative prefix in 47 UI strings. Full cleanup rules in 5.9.

## 3. Product direction

### 3.1 Name

"Pokémon" is a trademark (not a copyright issue as such). Fan tools like
Showdown, Smogon and Bulbapedia use species and move names freely; what gets
fan projects in trouble is using the brand as your product name or logo,
bundling ripped assets, or charging money. Not legal advice, but the low-risk
setup is:

- An original product name and logo. The app already has one: the Sync Core
  orb and gem mark. Candidates: **Sync Core** (recommended, matches the
  existing icon and home screen), Boxwise, Fieldkit. Check the name on GitHub,
  npm and the stores before committing to it.
- Describe it as "an unofficial companion for Pokémon games and Showdown" in the
  README and About screen (descriptive use, not branding).
- Keep fetching sprites at runtime instead of bundling them (already the case).
- Keep the disclaimer. Stay free.

The rename touches `package.json` (`name`, `productName`, `appId`), the window
title, the user-data folder (needs the existing migration helper again) and the
README.

### 3.2 Game profiles

A game profile bundles everything that differs between games. Every tool reads
the active profile instead of assuming Cobblemon or NatDex OU.

```ts
interface GameProfile {
  id: string;                 // 'cobblemon', 'showdown-gen9ou', 'champions-vgc'
  label: string;
  engine: {
    gen: number;              // replaces the 14 hard-coded 9s
    showdownFormat: string;   // format id for @pkmn/sim, e.g. 'gen9ou'
    gameType: 'singles' | 'doubles';
    levelRule: { kind: 'fixed'; level: number } | { kind: 'free'; cap?: number };
    mods?: string[];          // sim data mods (custom species, move changes)
  };
  dex: DataPackRef;           // species, learnsets, items, abilities
  usage?: DataPackRef[];      // one or more Smogon formats + cutoffs
  spawns?: DataPackRef;       // only for open-world games
  legality: LegalityRules;    // bans, clauses, learnable-move rules
  raids?: RaidRules;          // 5.5.3
  features: { spawns: boolean; breeding: boolean; pcBox: boolean; liveBridge: boolean };
}
```

Profiles for v2, in order:

| Profile | Why | Effort |
| --- | --- | --- |
| Cobblemon | Existing users and data. Battles run on an embedded Showdown engine, so sim and calc results transfer directly | S (mostly moving existing code behind the interface) |
| Showdown Gen 9 OU | Largest replay and usage data, best for training and for showing results | S |
| Showdown NatDex OU | Current bundle; closest to Cobblemon's Megas and Z-moves | S |
| Pokémon Champions VGC | Official competitive game since April 2026, doubles | L (doubles changes the sim UI, bots and models). Later |
| Pixelmon, PokeMMO | Same mainline mechanics, different data sources | M each. Later, only if asked for |

Spawn atlas, breeding and PC box stay Cobblemon features and hide on profiles
that do not have them.

### 3.3 Navigation

Twelve hexes is too many to scan and several overlap. Collapse into six areas,
keep the orb as the home screen:

| Area | Contains (old tools) |
| --- | --- |
| Box | PC Box, Team Builder, EV/IV planner |
| Dex | Pokédex, Moves, Spawns |
| Battle | Damage calc (Battle and Calcdex merged), Practice, Live tracker |
| Counters | Counter Draft, Pokédex counters tab, Raid planner (new) |
| Meta | Usage stats for the active profile's formats |
| Breed | Breeding |

Each area gets one name, used for the hex, the header and the window title.

## 4. Architecture

```
                      Electron main
  +--------------------------------------------------------------+
  |  SQLite (sql.js): boxes, teams, battles, settings            |
  |  Data pack + model cache (userData, checksummed downloads)   |
  |  Mod bridge WebSocket :8788 (raw Showdown protocol in)       |
  +------------------------------+-------------------------------+
                                 | IPC
  +------------------------------v-------------------------------+
  | Renderer (React)                                             |
  |   Game profile store -> every tool                           |
  |                                                              |
  |   Worker: sim         @pkmn/sim BattleStream, bots,          |
  |                       sim-verified counters                  |
  |   Worker: ml          onnxruntime-web: matchup, team, set    |
  |                       models                                 |
  |   Main thread:        @smogon/calc for instant calcs,        |
  |                       @pkmn/client battle state for UI       |
  +--------------------------------------------------------------+

  Offline, not shipped in the app:
    tools/simgen (Node)   generate labeled battles with @pkmn/sim
    ml/ (Python)          ingest replays + Smogon stats, train,
                          evaluate, export ONNX + model cards
```

Key choices:

- **`@pkmn/sim` for battles** (MIT, v0.10.11). It is an automated extraction of
  Showdown's simulator, typed, versioned and usable in the browser. Correct
  mechanics for every move, ability and item without maintaining our own.
- **`@pkmn/protocol` and `@pkmn/client`** (MIT, v0.7.3) to parse Showdown's
  protocol into a battle state for the UI. The same parser handles practice
  battles, live battles from the mod, and imported replays.
- **`@smogon/calc` stays** for instant single calcs and for features in the ML
  models. Upgrade to 0.12.
- **ONNX for models.** Train in Python, export to ONNX, run in a worker with
  `onnxruntime-web` (MIT, v1.30). No Python needed at runtime.
- **Data packs and models are downloaded, not committed.** Published as GitHub
  Release assets with a manifest and SHA-256, cached in user data, same pattern
  as the existing sprite cache. The app works offline with whatever it last
  downloaded and falls back to heuristics when a model is missing.

## 5. Feature specs

### 5.1 Data packs

- One pack per (profile, data kind, version). Kinds: `dex`, `usage`, `sets`,
  `spawns`, `model`.
- `usage` packs come from Smogon's monthly `chaos` JSON per format and rating
  cutoff, plus sets from data.pkmn.cc. Keep the existing `fetch-smogon.mjs`
  logic but loop over the formats each profile asks for.
- A manifest (`packs.json`) lists packs, versions, sizes and hashes. The app
  checks it at most once a day when online.
- Replace the single `smogon.json` import with a `UsageSource` that can hold
  several formats and months, so Meta can show trends ("Kingambit up 3% since
  last month").

Acceptance: switching profile in settings changes usage data, legality and
gen across every tool without a restart.

### 5.2 Battle engine

- Run `@pkmn/sim`'s `BattleStream` inside a dedicated Web Worker so long
  searches never block the UI.
- Both practice battles and bot search use the real engine. Search clones state
  with the simulator's own serialization rather than our reducer.
- `@pkmn/client` becomes the state model the UI renders from. The current event
  reducer (`lib/battle/events.ts`, `state.ts`) and `search/simulate.ts` are
  retired once parity tests pass. Keep `predictor/` and `search/explain.ts`;
  they get rewired onto the new state.
- Calc wrapper fixes regardless of the rest: normalize items and moves the same
  way abilities are, forward base stat overrides, read gen from the profile.
- Engine numbers from a first spike (Node 22, one core, `gen9randombattle`):
  - 100 full battles between random players: about 65 ms per battle, about
    460 turns per second.
  - Cloning a battle with `State.serializeBattle` / `deserializeBattle`: about
    1.7 ms. Clone plus one turn: about 2.3 ms.
  - Gotcha: deserializing from the serialized object shares the `log` array
    with the original, so clones keep appending to one log until the engine
    throws its "Infinite loop" line-limit error. Clone from a JSON string.
- What that means for search: one ply on the real engine (around 9 x 9 joint
  actions x 3 opponent set guesses, about 240 transitions) costs about 0.6 s.
  A full two-ply tree is about 59k transitions, over two minutes. So the
  Search bot uses the real engine for the first ply and a fast calc-based
  model for the second, and MCTS runs on a time budget across a small worker
  pool. If that is still too slow, look at a Rust engine compiled to WASM
  (poke-engine is singles-only and documents itself as less complete than
  Showdown).

Acceptance: 50 scripted battles produce identical logs to the same seeds run in
Showdown's own simulator; the old simulator's tests are either ported or
deleted with a note on why.

### 5.3 Practice battles against bots

The "face against bots" feature. You pick a team (saved team, box, Showdown
paste, random team, or a sampled meta team) and an opponent, and play full
battles in the app.

Bot levels:

| Level | Name in UI | How it picks | Purpose |
| --- | --- | --- | --- |
| 0 | Random | Random legal choice (`@pkmn/sim` ships one) | Smoke tests, baseline |
| 1 | Greedy | Highest expected damage this turn, switches out of a guaranteed KO | Plays like a typical in-game trainer |
| 2 | Search | Expectimax: first ply on the real engine, second ply on a calc-based model, opponent sets from the predictor, chance nodes for damage roll buckets, crits and accuracy | Default practice partner, also powers hints |
| 3 | MCTS | Information-set MCTS with determinization: sample hidden sets from the predictor, run the search per sample, pick the action that wins most often | Strong offline opponent |
| 4 | Learned (stretch) | Policy and value network trained on high-rated replays, used as priors inside MCTS | The "this is actually ML" bot |

Optional opponent style: "Plays like Cobblemon NPCs", a port of the decision
logic in Cobblemon's own `battles/ai` package, so practice matches what you
meet in the world.

Opponent team sources: random (`@pkmn/randoms`), sampled from the meta for the
active format, a saved rival team (Counter Draft), or a raid boss (5.5.3).

In-battle features:

- **Hint** button: shows the Search bot's top three actions with the existing
  explanation text (threats, assumptions, principal variation).
- **Take back** one turn (state snapshot per turn).
- **Eval graph** along the turn timeline.
- **Export** as a Showdown log so it opens in the standard replay viewer.

After the battle, **review**: run the Search bot on every decision you made and
flag turns where your choice was much worse than its best one, the way chess
apps flag blunders.

Bot quality is measured, not asserted:

- `npm run bots:gauntlet` plays a round robin between all levels over a fixed
  set of teams and writes an Elo table with confidence intervals.
- CI runs a short version (around 100 games per pairing) and fails if a level
  stops beating the one below it.

Acceptance: a full 6v6 Gen 9 OU battle against levels 0 to 2 plays to the end
with no desyncs; level 2 beats level 1 at least 65% over 500 games; level 1
beats level 0 at least 90%.

### 5.4 Damage calc

- Merge Battle Calculator and Calcdex into one page: Calcdex's two-roster
  layout with the single calc as its "quick" mode.
- Roll distribution histogram and KO chance after hazards and end-of-turn
  damage (the calc can already account for some of this).
- "Send to practice" button: start a battle from the two rosters on screen.
- Golden tests: 30 known calcs (taken from the official calc's own tests) must
  match exactly through our wrapper, including id-form inputs.

### 5.5 Counters

Three related features on one shared model.

#### 5.5.1 Matchup model (1v1)

Question it answers: given my set A and their set B in this format, how likely
is A to beat B one on one, and how much HP does it have left?

- **Data**: generated, not scraped. `tools/simgen` samples set pairs from the
  usage distribution (moves, items, spreads, Tera types) plus random box-style
  sets at varied levels for Cobblemon, and plays each pairing several times
  with level 2 bots on both sides. Output: win rate, remaining HP, turns,
  whether B was forced out. Millions of games are cheap to generate.
- **Features**: per side, base stats, types, the calc's damage range of each
  move both ways, nHKO each way, speed comparison including priority and
  Choice Scarf, recovery, setup, status and pivot moves, level.
- **Model**: gradient boosted trees (LightGBM) as the main model, logistic
  regression as the baseline. Export to ONNX.
- **Why a model and not just simulate**: a box of 300 mons against a 6-mon team
  at 20 games per pair is 36,000 battles, minutes of compute. The model answers
  in milliseconds. The simulator is then used to verify the top picks.
- **External check**: Smogon's monthly stats include "checks and counters" per
  species, with a score that is the win rate minus four standard deviations
  (for example `57.097 (62.10±1.25)`). We compare our rankings to theirs with
  Spearman correlation per species. That number goes in the README.

Metrics: log loss and Brier score on held-out simulated pairs, calibration
plot, Spearman vs Smogon checks and counters.

#### 5.5.2 Team counters (Counter Draft v2)

- Input: opponent team (species, optional sets and levels), my box.
- Score every box mon against every opponent with the matchup model.
- Pick 6 to maximize coverage: every opponent mon should have at least one
  high-probability answer, weighted by how threatening it is, with a penalty
  for shared weaknesses. Same greedy-plus-swap search as now, with learned
  scores instead of the win/trade/lose rules.
- **Verify**: play the drafted team against the opponent team 200 times with
  level 2 bots and show the win rate with a confidence interval: "Your team
  wins 64% ± 4% against this team in simulation."
- Show per-threat answers and the opponent mon you have the least answer for,
  as now.

#### 5.5.3 Raid planner (new)

Raids differ by game, so the rules are data:

```ts
interface RaidRules {
  bossLevel: number;
  hpMultiplier: number;          // boss HP pool vs a normal mon
  partySize: number;             // players fighting at once
  sharedHp: boolean;             // one HP pool for everyone
  shields?: { atHpPct: number; damageMultiplier: number }[];
  bossActionsPerTurn: number;
  gimmick?: 'tera' | 'dynamax' | 'mega' | null;
  turnLimit?: number;
}
```

Presets: Cobblemon Raid Dens (per its listing: tiers 1 to 7, one boss HP pool
shared by all players, Tera, Dynamax and Mega raid types; HP scaling still to
confirm against the mod's config) and Scarlet/Violet Tera raids. Users can edit
any preset.

For each box mon against the boss:

- **Quick estimate**: expected damage per turn dealt and taken from the calc,
  turns survived, and an estimator (boss HP divided by damage it can deal before
  fainting; under 1 means it can solo). Same idea as Pokebattler's
  estimator and time-to-win for Pokémon GO raids.
- **Simulated**: Monte Carlo through `@pkmn/sim` with a custom format that
  applies the HP multiplier and shields. Rank by win rate, then turns to win.
- Output: ranked counters with "best moveset for this raid" and what to change
  (move to teach, item), plus a party suggestion when party size is above 1.

### 5.6 Team builder

#### Team strength model

Question it answers: in this format, how likely is team A to beat team B,
ignoring who is piloting it?

- **Data**: Showdown replays. Gen 5 onward shows all six species at team
  preview; moves, items and Tera types are partially revealed during play.
  Sources in 6.1.
- **Inputs**: per mon, a token for species plus tokens for revealed moves, item,
  ability and Tera type. Unknown slots are filled from the set model.
- **Model**: a set transformer. Embed each mon, self-attention within a team,
  cross-attention between the two teams, one logit out. Baseline: logistic
  regression on species presence plus pairwise species features.
- **Skill confound**: player rating explains a lot of the outcome. Train with
  both ratings as inputs and set them equal at inference, so the model scores
  the teams and not the players.
- **Metrics**: AUC and calibration on a held-out later month (time split, not
  random). Prior art for reference: FutureSightML reports a pre-game AUC of 0.726
  on Gen 9 OU for its transformer model.

#### Meta score

A team's meta score is its average predicted win probability against a sample
of real teams from the format (around 500 teams from recent high-rated
replays). This replaces the hand-weighted sum in `bestSix.ts`.

#### Search over the box

- Candidates: the user's box filtered by the profile's legality rules (as now).
- Search: beam search over adding members (width around 64), then single-swap
  refinement, then pick three diverse results (offense, balance, bulky) by
  clustering the final beam. Exhaustive search is possible for small boxes
  (C(30,6) is about 594k teams) if the model is fast enough.
- Sets: for each pick, use the mon's actual set; show the suggested upgrade
  from the set model (moves to teach, item, nature, EVs) using the existing
  advice code in `bestSix.ts`.
- Structural checks stay as explanations and soft constraints: hazard setter,
  hazard removal, speed control, a win condition.

#### Catch list

The open-world feature nothing else does: which species, not in your box,
would raise your best team's meta score the most, and where to find it. Join
the marginal gain with the spawn data ("Corviknight: +4.1% meta score, fills
hazard removal. Spawns in taiga, night, uncommon").

#### Explanations

- Per member: meta score drop when that member is removed.
- Worst matchups: the meta teams this team loses to most often, with the mons
  responsible.
- Old heuristic stays available as "Classic" and is the fallback when no model
  is installed.

**Proof it works**: for the same box, build a team with Classic and with the
model, then have both play 500 simulated games against meta teams with level 2
bots piloting. Report the win rate difference with a confidence interval.

### 5.7 Live tracker and companion mod

Cobblemon runs battles on an embedded Showdown engine (`battles/runner/graal`
and `battles/runner/socket` in its source), and
`ShowdownInterpreter.interpretMessage(battleId, message)` receives the raw
Showdown protocol for every battle. So the mod does not need its own event
translation (the current placeholder `EventTranslator.kt`). It can:

1. Hook `interpretMessage` with a Mixin (or read `battle.showdownMessages`).
2. Filter to the local player's view: public lines plus the player's own
   `|request|` data. Never forward the opponent's private side lines. The
   engine's own `extractChannelMessages` (exported by `@pkmn/sim`) already
   splits `|split|` blocks per player, so the same logic can run on either
   end.
3. Send the lines over the existing WebSocket on `127.0.0.1:8788`.

The app feeds those lines into `@pkmn/client`, which is exactly what the
practice mode does, so the live tracker becomes a read-only practice screen
with hints. Manual mode stays as a fallback but writes protocol lines too
("Garchomp used Earthquake, Rotom took 45%") instead of a separate event model.

Limits to state plainly in the UI: works in singleplayer and on servers that
install the mod; a client-only setup on someone else's server sees less.

Fairness: in PvP the tracker shows only what the player can already see, and
the hint button can be disabled per battle type in settings.

### 5.8 UI overhaul

- **One design system.** Collapse `hud.css`, `design-system.css` and
  `styles.css` into a single token file (colors, spacing, radii, type scale as
  CSS variables) wired into the Tailwind theme. Delete what is unused.
- **One component set.** `PageShell` (header grid with title left, actions
  right, close button in its own column so they can never overlap), `Panel`,
  `Toolbar`, `Tabs`, `DataTable`, `SpeciesCell`, `TypeChip`, `StatBar`,
  `Field`. Rebuild the Live tracker on these first since it is furthest off.
- **List rows** never truncate names below about 10 characters: hide BST
  first, then wrap chips under the name. Forms get a label ("Mega", "Galar").
- **Readable text.** Mono uppercase only for labels and numbers; body copy in
  the sans face at 14 px or more.
- **Keep the look.** The orb home screen, biome gradient and glass panels stay.
  This is about spacing and consistency, not a redesign.
- **Visual regression tests.** Playwright screenshots of every area at 1100x700
  and 1920x1080 in CI, plus an automated overflow check (no element wider than
  its container, no text clipped without an ellipsis or tooltip).

Acceptance: all twelve issues in 2.6 are fixed and covered by a screenshot
test.

### 5.9 Repo hygiene

- **Commit identity.** This repo is configured with
  `user.name "Tahsin Jawwad"` and
  `user.email 144264787+tahsinj@users.noreply.github.com` (the same identity as
  every existing commit), with no co-author or tool trailers. GitHub attributes
  commits by author email, so they show up under my account.
- **History.** All 53 existing commits are already under my name. Some older
  messages are long and list-like; rewriting published history is not worth
  breaking clones over, so leave it. New messages: short, imperative, one line
  unless a body is really needed.
- **Writing rules for code and docs**, enforced by a small `npm run lint:prose`
  script that greps for the patterns below:
  - Comments say why, not what. No comment on code that reads fine without one.
  - No references to plans, phases, specs, options or docs ("for the MVP",
    "option C", "the doc's idea", "for now", "later phases").
  - ASCII only in comments: `->` not arrows, `x` not the multiplication sign,
    `>=` not the symbol, `...` not the ellipsis character, no em or en dashes.
  - No filler words that read as generated: "robust", "seamless", "leverage",
    "honest", "deliberately", "comprehensive", "crucial", "ensure".
  - UI strings may keep typographic characters where they are a design
    choice, but the decorative "◢" prefix goes.
- Known spots to fix first: `lib/counterDraft.ts:3`, `lib/bestSix.ts:405`,
  `:818`, `:849` (and the `__internals__` export that only exists to silence
  an unused-import warning), `lib/battle/search/simulate.ts:4-5`,
  `search/evaluate.ts:5`, `search/expectimax.ts:17`, `battle/events.ts:272`,
  `battle/state.ts:288`, `db/schema.sql:1-2`, the "REFERENCE SCAFFOLD" banners
  in `cobblemon-mod/`.
- **Build health.** Regenerate and commit `package-lock.json` so `npm ci`
  works, pin TypeScript 5.x until the `baseUrl` migration, add ESLint, and a
  GitHub Actions workflow: `npm ci`, typecheck, tests, build, short bot
  gauntlet, screenshot tests.
- **Dead code.** Delete everything listed in 2.7. Rename `riven_tag` to `tag`
  with a migration.

## 6. ML plan

### 6.1 Data sources

| Source | What | Use | Notes |
| --- | --- | --- | --- |
| [Smogon stats](https://www.smogon.com/stats/) | Monthly usage per format and rating cutoff: moves, items, spreads, teammates, checks and counters (`chaos` JSON) | Set priors, meta sampling, validation of counters | Already used for NatDex OU |
| [data.pkmn.cc](https://data.pkmn.cc) | Curated sets and processed stats | Set model, sample sets for simgen | Already used |
| Showdown replays | Public replay search and per-replay logs on `replay.pokemonshowdown.com` | Team model, set model, bot imitation | Respect rate limits, cache, prefer the datasets below |
| [Metamon](https://arxiv.org/abs/2504.04395) datasets | 3.5M first-person trajectories reconstructed from replays, plus checkpoints | Bot level 4, set model | The paper covers Gens 1 to 4. Check metamon.tech for newer formats |
| [PokéChamp](https://arxiv.org/abs/2503.04094) dataset | 3M+ games, 500k+ high-Elo | Team model | Check license |
| 30.5M replay dataset on Hugging Face (HolidayOugi) | Raw replays across formats, used by FutureSightML | Team model | Check license |
| [VGC-Bench](https://arxiv.org/abs/2506.10326) | 700k+ doubles battle logs and baselines | Champions VGC profile later | Doubles only |
| [PokéAgent Challenge](https://arxiv.org/abs/2603.15563) | 20M+ battle trajectories and baselines from the NeurIPS 2025 competition | Bot baselines and eval | |
| Our own simulations | Labeled 1v1, team and raid battles via `@pkmn/sim` | Matchup model, raid planner, bot eval | Unlimited, controllable, covers Cobblemon levels |
| Cobblemon data | Species, learnsets, spawns (MPL-2.0 code) | Cobblemon profile | Already used |

We ship derived artifacts only (aggregated stats, model weights), never raw
replay files. Each dataset's license gets checked and recorded in the model card
before training on it.

### 6.2 Models

| Model | Input | Output | Main model | Baseline | Metric |
| --- | --- | --- | --- | --- | --- |
| Set predictor | Species, format, revealed info | Distribution over full sets | Current Bayesian predictor with Smogon priors, calibrated on replays | Most common set | Top-1 item accuracy, move recall at 4, log loss |
| Matchup | Two sets plus context | P(A beats B), HP left | LightGBM on calc features | Logistic regression | Log loss, Brier, Spearman vs Smogon checks and counters |
| Team strength | Two teams of up to six partially known sets | P(team A wins) | Set transformer | Logistic regression on species and pairs | AUC and calibration on a later month |
| Bot policy and value (stretch) | Battle state from one side | Action probabilities, win probability | Small transformer, behavior cloning on high-rated replays | Level 2 bot | Gauntlet Elo |

### 6.3 Training and evaluation setup

- `ml/` is a Python project (uv, Python 3.12, polars, LightGBM, PyTorch, onnx).
  Folders: `ingest/`, `features/`, `train/`, `eval/`, `export/`.
- `tools/simgen/` is a Node package that uses `@pkmn/sim` with worker threads and
  writes Parquet or JSONL. Same engine as the app, so labels match what users
  see.
- Every trained model produces `model.onnx`, `metrics.json` and a
  `MODEL_CARD.md` (data, license, date range, metrics, known limits).
- Feature code that has to match between Python training and the TypeScript
  app (calc features especially) is computed in TypeScript once, during
  simgen and replay ingestion, and stored with the data. Python never
  re-implements game mechanics.

### 6.4 In the app

- `onnxruntime-web` in the ML worker. Models are loaded lazily per tool.
- Size budget: under 20 MB per model, under 60 MB total.
- Every ML feature has a non-ML fallback (today's heuristics), and the UI says
  which one produced a result.

### 6.5 What goes in the README

Numbers, not adjectives: matchup model Brier score and Spearman vs Smogon,
team model AUC on a held-out month, model-built vs Classic team win rate in
simulation, the bot Elo table, and a short demo clip of a practice battle with
hints.

## 7. Milestones

Sizes are relative (S, M, L), not dates.

| # | Milestone | Contents | Size | Done when |
| --- | --- | --- | --- | --- |
| M0 | Foundations | Lockfile, CI, ESLint, commit identity, dead code removal, prose cleanup, calc input fixes, rename decision | S | `npm ci` and CI are green, `lint:prose` passes |
| M1 | UI shell | Token file, component set, `PageShell`, six areas, fixes for 2.6, screenshot tests | M | All 2.6 issues covered by passing screenshot tests |
| M2 | Engine | `@pkmn/sim` worker, engine spike, `@pkmn/client` state, practice battles with bots 0 to 2, merged calc | L | Acceptance in 5.2 and 5.3 |
| M3 | Profiles and data packs | `GameProfile`, Cobblemon + Gen 9 OU + NatDex OU, pack manifest and downloads | M | Profile switch changes every tool |
| M4 | Counters v2 | simgen, matchup model, Counter Draft v2 with sim verification, raid planner | L | Metrics in 5.5 published in a model card |
| M5 | Team builder v2 | Replay ingestion, team model, box search, catch list, Classic vs model comparison | L | Comparison result in README |
| M6 | Bots v2 | Level 3 MCTS, post-game review, gauntlet in CI, level 4 if time allows | M to L | Elo table in README |
| M7 | Live bridge | Mod hook on `interpretMessage`, protocol filtering, tracker on `@pkmn/client` | M | A singleplayer Cobblemon battle shows live with hints |

M0 and M1 come first because every later milestone adds UI and code on top of
them.

## 8. Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `@pkmn/sim` too slow for in-app search (spike: 2.3 ms per clone plus turn) | Bots 2 and 3 feel sluggish | Real engine for the first ply only, calc-based model below it, worker pool, time-boxed search |
| Replay data skewed to high-usage mons | Team model is weak on rare species, which Cobblemon boxes are full of | Back off to species-agnostic features (types, stats, roles); fall back to simulation for unseen species |
| Showdown levels vs Cobblemon levels | Models trained at level 100 misjudge level 37 mons | Matchup model trained on mixed levels from simgen; team model results flagged when levels differ a lot |
| Dataset licenses | Cannot ship a model trained on a dataset with restrictive terms | Check before training, record in model cards, ship only derived weights |
| Cobblemon internals change between versions | Mod breaks on update | Hook one stable entry point (`interpretMessage`), version-check on connect |
| Trademark | Takedown request | Rename, no bundled assets, stay free, keep disclaimer |
| Scope | Half-finished features everywhere | Milestones are independent; each ships something usable |

## 9. Open questions

1. **Name.** Go with Sync Core, pick another, or keep the current name for now?
2. **Formats.** Is Cobblemon singles plus Showdown Gen 9 OU the right starting
   pair? Does Champions VGC doubles matter soon?
3. **Raids.** Which raid rules do you play with (Cobblemon Raid Dens mod,
   another mod, Scarlet/Violet Tera raids)?
4. **Python.** OK to have a Python `ml/` folder for training, with only ONNX
   files used by the app?
5. **Model hosting.** GitHub Releases on this repo for packs and models?
6. **Mod.** Worth finishing the Fabric mod (Kotlin, Gradle) in this pass, or
   park live tracking until the rest is done?
7. **Platforms.** Windows only, or also macOS and Linux builds?

## 10. References

Engines and libraries

- `@pkmn/sim`, `@pkmn/client`, `@pkmn/protocol`, `@pkmn/randoms`, `@pkmn/stats` (MIT): https://github.com/pkmn
- `@smogon/calc` (MIT): https://github.com/smogon/damage-calc
- poke-engine (Rust, singles search engine): https://github.com/pmariglia/poke-engine
- onnxruntime-web (MIT): https://onnxruntime.ai
- Cobblemon source (MPL-2.0), Showdown integration under `common/src/main/kotlin/com/cobblemon/mod/common/battles/`: https://gitlab.com/cable-mc/cobblemon

Research and prior art

- Grigsby et al., "Human-Level Competitive Pokémon via Scalable Offline Reinforcement Learning with Transformers" (Metamon), RLC 2025: https://arxiv.org/abs/2504.04395
- Karten et al., "PokéChamp: an Expert-level Minimax Language Agent", ICML 2025: https://arxiv.org/abs/2503.04094
- Angliss et al., "VGC-Bench", AAMAS 2026: https://arxiv.org/abs/2506.10326
- "The PokéAgent Challenge: Competitive and Long-Context Learning at Scale", NeurIPS 2025 competition: https://arxiv.org/abs/2603.15563
- Yu, "PokaiTrainer: Scaling Belief-State Search to Competitive Pokémon VGC", 2026: https://arxiv.org/abs/2608.29197
- FutureSightML, ML team builder with transformer and XGBoost win-rate models and a genetic search (MIT): https://github.com/HotHams/FutureSightML
- Smogon usage stats and the checks and counters metric: https://www.smogon.com/stats/
- Pokebattler raid methodology (estimator, time to win): https://articles.pokebattler.com/help/raid-advice/

Games

- Cobblemon Raid Dens mod: https://modrinth.com/mod/cobblemonraiddens
- Pokémon Champions (released April 2026, official VGC game from 2026)

## Appendix: how the audit was done

- Read the source for the team builder, counters, matchup, calc wrapper,
  simulator, search, evaluator, reducer, main process, preload and mod.
- Ran `npm ci` (fails), `npm install` without saving the lockfile, `npm test`
  and `tsc --noEmit`.
- Rendered every tool in headless Chromium against the Vite dev server with a
  stubbed `window.assistant` holding an eight-mon box and one saved team, took
  screenshots, and counted overflowing and clipped elements per page.
- Ran the calc wrapper directly on known calcs (Choice Band Garchomp into
  Heatran, Earthquake into Levitate) with display-name and id-form inputs.
- Timed `@pkmn/sim` 0.10.11 in Node: 100 random battles, state clones, and
  clone plus one turn.
- Grepped for dead imports, unused components, comment density and writing
  patterns.
