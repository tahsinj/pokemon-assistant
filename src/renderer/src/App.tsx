import { useEffect, useMemo, useState } from 'react';
import { loadDesignFonts } from './lib/loadDesignFonts';
import { loadData } from './lib/data';
import type { Pokemon, Move, SpawnEntry, HeldItem } from './lib/types';
import {
  BIOMES,
  HUD_TEAM,
  HUD_TOOLS,
  HUD_TRAINER,
  type BiomeName,
} from './lib/hudFixtures';
import { TrainerBeacon } from './components/hud/TrainerBeacon';
import { SyncCore } from './components/hud/SyncCore';
import { TeamColumn } from './components/hud/TeamColumn';
import { FocusLens } from './components/hud/FocusLens';
import { TelemetryStrip } from './components/hud/TelemetryStrip';
import { PokedexPage } from './pages/PokedexPage';
import { TeamBuilderPage } from './pages/TeamBuilderPage';
import { BattlePage } from './pages/BattlePage';
import { BattleSessionPage } from './pages/BattleSessionPage';
import { CounterPage } from './pages/CounterPage';
import { PlannerPage } from './pages/PlannerPage';
import { PcPage } from './pages/PcPage';
import { SpawnPage } from './pages/SpawnPage';
import { BreedingPage } from './pages/BreedingPage';

type ToolId =
  | 'pokedex'
  | 'team'
  | 'battle'
  | 'session'
  | 'counter'
  | 'planner'
  | 'pc'
  | 'spawns'
  | 'breeding';

const TOOL_TITLES: Record<ToolId, string> = {
  pokedex: 'Pokédex',
  team: 'Team Builder',
  battle: 'Battle Calculator',
  session: 'Live Battle Tracker',
  counter: 'Counter Picker',
  planner: 'EV / IV Planner',
  pc: 'PC Storage',
  spawns: 'Spawn Atlas',
  breeding: 'Breeding',
};

/**
 * Vertical budget that the Sync Core (and the Focus Lens column) must
 * fit in. Reserved heights:
 *   - row 1 (Trainer beacon / Squad pill): 80
 *   - row 3 (Telemetry / key hint):        56
 *   - outer padding (24 * 2):              48
 *   - row gaps (16 * 2):                   32
 *   Total reserved:                        216
 */
const RESERVED_V = 216;
const CORE_MIN = 300;
const CORE_MAX = 440;

export function App() {
  const [pokemon, setPokemon] = useState<Pokemon[] | null>(null);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [items, setItems] = useState<HeldItem[]>([]);
  const [spawns, setSpawns] = useState<Record<string, SpawnEntry[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [openTool, setOpenTool] = useState<ToolId | null>(null);
  const [staggerIn, setStaggerIn] = useState(false);
  const [activeMonId, setActiveMonId] = useState<string>(HUD_TEAM[1].id);
  const [hoverMonId, setHoverMonId] = useState<string | null>(null);
  const [biome] = useState<BiomeName>('Verdant Dusk');
  const [coreSize, setCoreSize] = useState(360);

  const focusMon =
    HUD_TEAM.find((m) => m.id === (hoverMonId || activeMonId)) || HUD_TEAM[1];

  useEffect(() => {
    loadDesignFonts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    loadData()
      .then((d) => {
        if (cancelled) return;
        setPokemon(d.pokemon);
        setMoves(d.moves);
        setItems(d.items);
        setSpawns(d.spawns);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setPokemon(null);
        setLoadError(e instanceof Error ? e.message : 'Could not load game data.');
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    const b = BIOMES[biome];
    const root = document.documentElement;
    root.style.setProperty('--biome-a', b.a);
    root.style.setProperty('--biome-b', b.b);
    root.style.setProperty('--biome-c', b.c);
    root.style.setProperty('--biome-d', b.d);
    root.style.setProperty('--hud-accent', b.accent);
    root.style.setProperty('--hud-accent-2', b.accent2);
  }, [biome]);

  // Sync Core sizing: clamp against (a) center-column width left after the
  // Focus Lens column and Team rail and (b) the row-2 height budget.
  useEffect(() => {
    const recompute = () => {
      const lens = Math.min(320, Math.max(280, window.innerWidth * 0.22));
      const team = Math.min(220, Math.max(180, window.innerWidth * 0.14));
      const center = window.innerWidth - lens - team - 48 - 40;
      const vBudget = window.innerHeight - RESERVED_V;
      const next = Math.max(
        CORE_MIN,
        Math.min(CORE_MAX, Math.round(Math.min(center - 24, vBudget))),
      );
      setCoreSize(next);

      // Dive origin tracks the orb at the center of the middle column.
      const orbX = 24 + lens + 20 + center / 2;
      const orbY = 24 + 80 + 16 + vBudget / 2;
      const stageW = Math.min(1280, window.innerWidth * 0.92);
      const stageH = Math.min(860, window.innerHeight * 0.86);
      const stageL = (window.innerWidth - stageW) / 2;
      const stageT = (window.innerHeight - stageH) / 2;
      const ox = ((orbX - stageL) / stageW) * 100;
      const oy = ((orbY - stageT) / stageH) * 100;
      document.documentElement.style.setProperty('--dive-ox', `${Math.max(20, Math.min(80, ox))}%`);
      document.documentElement.style.setProperty('--dive-oy', `${Math.max(8, Math.min(70, oy))}%`);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  useEffect(() => {
    if (!openTool) {
      setStaggerIn(false);
      return;
    }
    setStaggerIn(false);
    const r1 = requestAnimationFrame(() => {
      const r2 = requestAnimationFrame(() => setStaggerIn(true));
      return () => cancelAnimationFrame(r2);
    });
    return () => cancelAnimationFrame(r1);
  }, [openTool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openTool) {
        e.preventDefault();
        setOpenTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTool]);

  const dataReady = !!pokemon;

  const diveModule = useMemo(() => {
    if (!openTool || !pokemon) return null;
    switch (openTool) {
      case 'pokedex':
        return <PokedexPage pokemon={pokemon} moves={moves} />;
      case 'team':
        return <TeamBuilderPage pokemon={pokemon} />;
      case 'battle':
        return <BattlePage pokemon={pokemon} moves={moves} items={items} />;
      case 'session':
        return <BattleSessionPage pokemon={pokemon} moves={moves} />;
      case 'counter':
        return <CounterPage pokemon={pokemon} moves={moves} />;
      case 'planner':
        return <PlannerPage pokemon={pokemon} />;
      case 'pc':
        return <PcPage pokemon={pokemon} items={items} />;
      case 'spawns':
        return <SpawnPage pokemon={pokemon} spawns={spawns} />;
      case 'breeding':
        return <BreedingPage />;
      default:
        return null;
    }
  }, [openTool, pokemon, moves, items, spawns]);

  return (
    <div
      className={`hud-root hud-perspective relative w-screen overflow-hidden ${
        openTool ? 'dive-open' : ''
      }`}
      style={{ height: '100vh' }}
    >
      <div className="biome">
        <div className="biome-blob a" />
        <div className="biome-blob b" />
        <div className="biome-blob c" />
      </div>

      <div
        className="base-layer relative z-10 w-full p-6 grid"
        style={{
          height: '100vh',
          gridTemplateColumns: 'minmax(280px, 320px) minmax(0, 1fr) minmax(180px, 220px)',
          gridTemplateRows: 'auto minmax(0, 1fr) auto',
          columnGap: '20px',
          rowGap: '16px',
        }}
      >
        {/* ROW 1 - Trainer beacon · (spacer) · Squad pill */}
        <div style={{ gridColumn: '1 / 2', gridRow: '1 / 2', minWidth: 0 }}>
          <TrainerBeacon trainer={HUD_TRAINER} />
        </div>
        <div style={{ gridColumn: '2 / 3', gridRow: '1 / 2' }} />
        <div
          style={{ gridColumn: '3 / 4', gridRow: '1 / 2' }}
          className="flex justify-end items-start"
        >
          <div className="font-mono-hud text-[13px] uppercase tracking-[.28em] text-[var(--hud-accent-2)] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(86,230,194,.22)] bg-black/40">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: 'var(--hud-accent-2)',
                boxShadow: '0 0 8px var(--hud-accent-2)',
              }}
            />
            Squad · 6/6
          </div>
        </div>

        {/* ROW 2 - FocusLens · SyncCore · TeamColumn */}
        <div
          style={{ gridColumn: '1 / 2', gridRow: '2 / 3', minHeight: 0, minWidth: 0 }}
        >
          <FocusLens mon={focusMon} />
        </div>
        <div
          style={{ gridColumn: '2 / 3', gridRow: '2 / 3', minWidth: 0, minHeight: 0 }}
          className="relative flex items-center justify-center"
        >
          <div className="relative" style={{ width: coreSize, height: coreSize }}>
            <SyncCore
              tools={HUD_TOOLS}
              active={openTool}
              size={coreSize}
              onPick={(id) =>
                setOpenTool((prev) => (prev === (id as ToolId) ? null : (id as ToolId)))
              }
            />
          </div>
          {!dataReady && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 mono-panel px-4 py-2 rounded-full text-[14px]">
              {loadError ? (
                <span style={{ color: 'var(--hud-danger)' }}>
                  ⚠ {loadError}{' '}
                  <button
                    type="button"
                    className="underline ml-1"
                    onClick={() => setLoadAttempt((n) => n + 1)}
                  >
                    retry
                  </button>
                </span>
              ) : (
                <span>◢ SYNCING DATA…</span>
              )}
            </div>
          )}
        </div>
        <div
          style={{ gridColumn: '3 / 4', gridRow: '2 / 3', minHeight: 0 }}
          className="flex justify-end items-center overflow-visible"
        >
          <TeamColumn
            team={HUD_TEAM}
            activeId={activeMonId}
            onPick={(id) => {
              setActiveMonId(id);
              setHoverMonId(null);
            }}
            onHover={setHoverMonId}
          />
        </div>

        {/* ROW 3 - Telemetry strip + key hint */}
        <div
          style={{ gridColumn: '1 / 4', gridRow: '3 / 4' }}
          className="flex items-end justify-between gap-4 flex-wrap"
        >
          <TelemetryStrip biomeName={biome} />
          <div className="key-hint">
            <span>
              <span style={{ color: 'var(--hud-accent)' }}>HEX</span> dive
            </span>
            <span className="sep">·</span>
            <span>
              <span style={{ color: 'var(--hud-accent-2)' }}>ESC</span> back
            </span>
            <span className="sep">·</span>
            <span>
              <span style={{ color: '#fff' }}>1–6</span> lead
            </span>
          </div>
        </div>
      </div>

      {/* Dive overlay */}
      <div className="dive-halo" />
      <div className="dive-backdrop" onClick={() => setOpenTool(null)} />
      <div
        className="dive-stage"
        role="dialog"
        aria-modal="true"
        aria-label={openTool ? TOOL_TITLES[openTool] : ''}
      >
        <button
          type="button"
          className="dive-close"
          onClick={() => setOpenTool(null)}
          aria-label="Close"
        >
          <span className="sr-only">Close</span>
        </button>
        <div className="dive-esc-hint">ESC · CLOSE</div>
        <div
          className={`dive-content ${staggerIn ? 'dive-stagger-in' : ''}`}
          key={openTool || 'empty'}
        >
          <div className="ds">{diveModule}</div>
        </div>
      </div>
    </div>
  );
}
