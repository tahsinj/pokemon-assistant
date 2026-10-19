# STAB Lab

Unofficial desktop team and battle lab for Pokémon Showdown singles, covering
Gen 9 OU and National Dex OU. Pick the format from the home screen and every
tool switches to that format's species, learnsets, bans and usage data. The
roadmap is in [docs/SPEC.md](docs/SPEC.md), and the task list for the
remaining work is in [docs/WORKPLAN.md](docs/WORKPLAN.md).

Built with Electron, React and TypeScript.

## Features

Five areas around the home screen orb:

- **Dex**: Pokédex with forms, learnsets, coverage and threats; move index
- **Box**: PC storage with set review, Team Builder with set editor and role
  audit, EV / IV planner, breeding odds
- **Battle**: damage calc (`@smogon/calc`) with a one-on-one matchup view, a
  whole-team view and roll histograms; practice battles on the Showdown
  simulator against three bot levels (Random, Greedy, Search), with
  explained hints, take-backs and a position graph; replay review for
  Showdown replays, saved Practice logs and battles entered by hand, with a
  quick review from revealed moves and a search review that rebuilds each
  turn in the simulator. The bots and hints never see hidden sets: they
  track what was revealed and fill in the rest with a set predictor.
- **Counters**: Counter Draft
- **Meta**: usage stats for the active format

## Bots

Practice offers four bots. Strength is measured by play: `npm run
bots:gauntlet` plays each level against the ones below it on random battle
teams under Gen 9 OU rules (sides swapped every game), and a weekly CI job
reruns a shorter version. Latest run, 100 games per pairing
([details](docs/bot-elo.md)):

| Bot | How it picks | Elo |
| --- | --- | --- |
| Random (level 0) | Any legal choice | 1000 |
| Greedy (level 1) | Most damage now, switches out of a sure KO | 1552 |
| Search (level 2) | One turn on the simulator against the foe's likely replies, plus a calc-based second turn | 1780 |
| MCTS (level 3) | Monte Carlo search: both sides choose by UCB, a few turns of rollout | 1794 |

MCTS beats Search 64% of the time but does a little worse than Search against
Greedy, so the chained Elo puts them close. Every bot above level 1 plans with
sets sampled from what it has seen, never the foe's real ones.

## Team model

The Team Builder can pick teams from your box with a team model: a set
transformer trained on about 13,000 rated Gen 9 OU replays from Showdown
(July to October 2026), scoring a team by its mean win chance against
high-rated teams from the latest month ([model card](docs/models/team-gen9ou.md)).
It reads species only; revealed sets would leak who won. Classic, the
weighted heuristic, is the default and the fallback; the model is one switch
away.

Classic scores a team on quality, teammate usage, shared weaknesses, coverage,
roles and field synergy. Synergy pairs a weather, terrain or Trick Room setter
with the teammates that gain from it (Drought with Chlorophyll or
Protosynthesis, Electric Surge with Quark Drive), and dual screens or Aurora
Veil with setup sweepers. Two automatic weathers on one team, a Swift Swim or
Chlorophyll user with no setter, and Aurora Veil without snow cost points. The
team card lists each synergy and clash.

Does it pick better teams? For one box of 30 Pokémon, each method's team
played 500 games against the same 100 meta teams on the same seeds, with the
Search bot on both sides (`npm run teamproof`,
[details](docs/team-proof-gen9ou.md)):

| Team | Win rate (95% interval) |
| --- | --- |
| Team model | 50.0% (45.6% to 54.4%) |
| Classic | 48.6% (44.2% to 53.0%) |

The difference, +1.4% (-4.3% to 7.1%), is within noise: on this much data the
model is no better than Classic yet. Its held-out AUC is 0.53 from species
alone, so more replays are the next step.

National Dex OU went worse. A model trained the same way on about 12,000
replays ([model card](docs/models/team-gen9nationaldex.md)) picked a team that
won 56.8% against Classic's 70.4% (difference -13.6%, -19.5% to -7.7%,
[details](docs/team-proof-gen9nationaldex.md)), so it is not published and
National Dex uses Classic only.

## Getting started

```bash
npm install
npm run dev        # Vite on :5173, then Electron
```

Other scripts:

```bash
npm run check      # eslint, prose lint, CSS lint, typecheck, tests
npm test           # vitest
npm run test:ui    # Playwright: every page at 1100x700 and 1920x1080
npm run build      # renderer -> dist/, electron -> dist-electron/
npm run test:electron  # loads the built app in Electron and starts a battle
npm run bots:gauntlet  # bot-vs-bot games, writes docs/bot-elo.md
npm run pack:win   # Windows installer into release/
```

The data under `src/renderer/public/data/` is generated and checked in, so you
don't need to rebuild it to use the app:

```bash
npm run build-dex     # dex.json: species, learnsets, moves, items per format
npm run fetch-usage   # usage/<format>.json: usage stats and sample sets
```

## Data sources

- Species, learnsets, moves, items, abilities, tiers and format bans:
  [Pokémon Showdown](https://github.com/smogon/pokemon-showdown), via
  [`@pkmn/sim`](https://github.com/pkmn/ps)
- EV yields and form sprite ids: [PokeAPI](https://github.com/PokeAPI/pokeapi)
  (BSD-3-Clause, © PokéAPI contributors)
- Damage calculation: [`@smogon/calc`](https://github.com/smogon/damage-calc)
- Usage stats and sample sets: [Smogon](https://www.smogon.com/stats/), via the
  [pkmn/smogon](https://github.com/pkmn/smogon) mirror. Usage stats are public
  domain; sets are Smogon's, and only move lists and spreads are bundled, no
  analysis text.
- Sprites: fetched at runtime from [PokeAPI](https://github.com/PokeAPI/sprites)
  and cached locally. No sprite images are included in this repo.
- Fonts: Inter, Space Grotesk and VT323 (SIL Open Font License), bundled
  through [Fontsource](https://fontsource.org).

## Disclaimer

STAB Lab is a free, non-commercial fan project. It is not affiliated with,
endorsed by, or sponsored by Nintendo, Game Freak, Creatures Inc. or The Pokémon
Company. Pokémon and Pokémon character names are trademarks of Nintendo,
Creatures Inc. and Game Freak.
