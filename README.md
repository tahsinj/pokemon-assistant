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
- **Battle**: damage calc (`@smogon/calc`) with a one-on-one matchup view and a
  whole-team view, plus a battle tracker with set prediction
- **Counters**: Counter Draft
- **Meta**: usage stats for the active format

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
