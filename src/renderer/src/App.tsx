import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { loadDesignFonts } from './lib/loadDesignFonts';
import { loadData } from './lib/data';
import type { SmogonBundle } from './lib/smogon';
import type { Pokemon, Move, SpawnEntry, HeldItem } from './lib/types';
import {
  BIOMES,
  HUD_TOOLS,
  type BiomeName,
  type HudTeamMon,
} from './lib/hudFixtures';
import { toHudTeam } from './lib/hudTeam';
import type { ModBridgeStatus } from './lib/bridgeTypes';
import { SyncCore } from './components/hud/SyncCore';
import { TeamColumn } from './components/hud/TeamColumn';
import { FocusLens } from './components/hud/FocusLens';
import { TelemetryStrip } from './components/hud/TelemetryStrip';
// Tool pages are lazy so the entry chunk stays lean - the battle pages alone
// pull in the whole battle engine (@smogon/calc data tables included). Each
// page chunk loads on first dive-in.
const PokedexPage = lazy(() =>
  import('./pages/PokedexPage').then((m) => ({ default: m.PokedexPage })),
);
const MovesPage = lazy(() => import('./pages/MovesPage').then((m) => ({ default: m.MovesPage })));
const TeamBuilderPage = lazy(() =>
  import('./pages/TeamBuilderPage').then((m) => ({ default: m.TeamBuilderPage })),
);
const BattlePage = lazy(() =>
  import('./pages/BattlePage').then((m) => ({ default: m.BattlePage })),
);
const BattleSessionPage = lazy(() =>
  import('./pages/BattleSessionPage').then((m) => ({ default: m.BattleSessionPage })),
);
const CalcdexPage = lazy(() =>
  import('./pages/CalcdexPage').then((m) => ({ default: m.CalcdexPage })),
);
const PlannerPage = lazy(() =>
  import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage })),
);
const PcPage = lazy(() => import('./pages/PcPage').then((m) => ({ default: m.PcPage })));
const SpawnPage = lazy(() =>
  import('./pages/SpawnPage').then((m) => ({ default: m.SpawnPage })),
);
const BreedingPage = lazy(() =>
  import('./pages/BreedingPage').then((m) => ({ default: m.BreedingPage })),
);
const SmogonPage = lazy(() =>
  import('./pages/SmogonPage').then((m) => ({ default: m.SmogonPage })),
);
const CounterDraftPage = lazy(() =>
  import('./pages/CounterDraftPage').then((m) => ({ default: m.CounterDraftPage })),
);

type ToolId =
  | 'pokedex'
  | 'moves'
  | 'team'
  | 'battle'
  | 'calcdex'
  | 'session'
  | 'planner'
  | 'pc'
  | 'spawns'
  | 'breeding'
  | 'smogon'
  | 'draft';

const TOOL_TITLES: Record<ToolId, string> = {
  pokedex: 'Pokédex',
  moves: 'Move Index',
  team: 'Team Builder',
  battle: 'Battle Calculator',
  calcdex: 'Calcdex',
  session: 'Live Battle Tracker',
  planner: 'EV / IV Planner',
  pc: 'PC Storage',
  spawns: 'Spawn Atlas',
  breeding: 'Breeding',
  smogon: 'Smogon Intel',
  draft: 'Counter Draft',
};

/**
 * Vertical budget that the Sync Core must fit in. Reserved heights:
 *   - row 1 (Squad pill):           36
 *   - row 3 (Telemetry / key hint): 56
 *   - outer padding (24 * 2):       48
 *   - row gaps (16 * 2):            32
 *   Total reserved:                 172
 * (The Focus Lens column spans rows 1–2, so it doesn't constrain row 1.)
 */
const RESERVED_V = 172;
const CORE_MIN = 300;
const CORE_MAX = 440;

export function App() {
  const [pokemon, setPokemon] = useState<Pokemon[] | null>(null);
  const [moves, setMoves] = useState<Record<string, Move>>({});
  const [items, setItems] = useState<HeldItem[]>([]);
  const [spawns, setSpawns] = useState<Record<string, SpawnEntry[]>>({});
  const [smogon, setSmogon] = useState<SmogonBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [openTool, setOpenTool] = useState<ToolId | null>(null);
  const [staggerIn, setStaggerIn] = useState(false);
  const [hudTeam, setHudTeam] = useState<HudTeamMon[]>([]);
  const [activeMonId, setActiveMonId] = useState<string>('');
  const [hoverMonId, setHoverMonId] = useState<string | null>(null);
  const [biome] = useState<BiomeName>('Verdant Dusk');
  const [coreSize, setCoreSize] = useState(360);

  // FX-lite drops the GPU-expensive effects (backdrop blurs, glows, ambient
  // animations). Explicit user choice persists; otherwise honor
  // prefers-reduced-motion and auto-enable when measured FPS is low.
  const [perfLite, setPerfLite] = useState(() => {
    const saved = localStorage.getItem('cobblemon-fx');
    if (saved === 'lite') return true;
    if (saved === 'full') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (localStorage.getItem('cobblemon-fx')) return; // user decided
    let raf = 0;
    let frames = 0;
    let start = 0;
    const sample = (now: number) => {
      if (!start) start = now;
      frames++;
      if (now - start < 1500) {
        raf = requestAnimationFrame(sample);
        return;
      }
      const fps = (frames * 1000) / (now - start);
      if (fps < 40) setPerfLite(true);
    };
    // Wait out the startup jank (data load + first paint) before sampling.
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(sample);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const toggleFx = () => {
    setPerfLite((prev) => {
      localStorage.setItem('cobblemon-fx', prev ? 'full' : 'lite');
      return !prev;
    });
  };

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon ?? []) m[p.id] = p;
    return m;
  }, [pokemon]);

  const focusMon =
    hudTeam.find((m) => m.id === (hoverMonId || activeMonId)) || hudTeam[0] || null;

  // Load the player's real squad (most recently updated saved team) for the
  // home HUD. Re-runs when returning from a tool dive so a freshly saved team
  // shows immediately. There is no demo team - an empty squad prompts a build.
  const loadHudTeam = useMemo(
    () => async () => {
      const api = window.cobblemon;
      if (!api?.teamsList || !pokemon) return;
      try {
        const list = await api.teamsList();
        if (!list.length) {
          setHudTeam([]);
          return;
        }
        const newest = list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
        const rec = await api.teamsLoad(newest.id);
        setHudTeam(rec ? toHudTeam(rec.members, pokemonById, moves) : []);
      } catch {
        setHudTeam([]);
      }
    },
    [pokemon, pokemonById, moves],
  );

  useEffect(() => {
    if (!openTool) void loadHudTeam();
  }, [openTool, loadHudTeam]);

  // Real companion-mod link state (the WS server lives in the Electron main
  // process). Passive: we only listen - the bridge is started from the Live
  // Battle Tracker.
  const [bridgeStatus, setBridgeStatus] = useState<ModBridgeStatus | null>(null);
  useEffect(() => {
    const bridge = window.cobblemon?.modBridge;
    if (!bridge) return;
    let cancelled = false;
    bridge.getStatus().then((s) => {
      if (!cancelled) setBridgeStatus(s);
    });
    const off = bridge.onStatus(setBridgeStatus);
    return () => {
      cancelled = true;
      off();
    };
  }, []);

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
        setSmogon(d.smogon);
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
      const orbY = 24 + 36 + 16 + vBudget / 2;
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
        return;
      }
      // 1–6 picks the lead on the home HUD (matches the key-hint).
      if (!openTool && e.key >= '1' && e.key <= '6') {
        const target = e.target as HTMLElement | null;
        if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
        const mon = hudTeam[Number(e.key) - 1];
        if (mon) {
          setActiveMonId(mon.id);
          setHoverMonId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openTool, hudTeam]);

  // Keep a valid lead selected as the team loads or changes.
  useEffect(() => {
    if (hudTeam.length && !hudTeam.some((m) => m.id === activeMonId)) {
      setActiveMonId(hudTeam[0].id);
    }
  }, [hudTeam, activeMonId]);

  const dataReady = !!pokemon;

  const diveModule = useMemo(() => {
    if (!openTool || !pokemon) return null;
    switch (openTool) {
      case 'pokedex':
        return <PokedexPage pokemon={pokemon} moves={moves} smogon={smogon} />;
      case 'moves':
        return <MovesPage pokemon={pokemon} moves={moves} />;
      case 'team':
        return <TeamBuilderPage pokemon={pokemon} moves={moves} items={items} smogon={smogon} />;
      case 'battle':
        return <BattlePage pokemon={pokemon} moves={moves} items={items} />;
      case 'calcdex':
        return <CalcdexPage pokemon={pokemon} moves={moves} items={items} smogon={smogon} />;
      case 'session':
        return <BattleSessionPage pokemon={pokemon} moves={moves} smogon={smogon} />;
      case 'planner':
        return <PlannerPage pokemon={pokemon} />;
      case 'pc':
        return <PcPage pokemon={pokemon} items={items} moves={moves} smogon={smogon} />;
      case 'spawns':
        return <SpawnPage pokemon={pokemon} spawns={spawns} />;
      case 'breeding':
        return <BreedingPage pokemon={pokemon} />;
      case 'smogon':
        return <SmogonPage pokemon={pokemon} moves={moves} smogon={smogon} />;
      case 'draft':
        return <CounterDraftPage pokemon={pokemon} moves={moves} smogon={smogon} />;
      default:
        return null;
    }
  }, [openTool, pokemon, moves, items, spawns, smogon]);

  return (
    <div
      className={`hud-root hud-perspective relative w-screen overflow-hidden ${
        openTool ? 'dive-open' : ''
      } ${perfLite ? 'perf-lite' : ''}`}
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
        {/* ROW 1 - (Focus Lens spans up from row 2) · spacer · Squad pill */}
        <div style={{ gridColumn: '2 / 3', gridRow: '1 / 2' }} />
        <div
          style={{ gridColumn: '3 / 4', gridRow: '1 / 2' }}
          className="flex justify-end items-start"
        >
          {hudTeam.length > 0 && (
            <div className="font-mono-hud text-[13px] uppercase tracking-[.28em] text-[var(--hud-accent-2)] flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(86,230,194,.22)] bg-black/40">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: 'var(--hud-accent-2)',
                  boxShadow: '0 0 8px var(--hud-accent-2)',
                }}
              />
              Squad · {hudTeam.length}/6
            </div>
          )}
        </div>

        {/* ROW 1–2 - FocusLens · SyncCore · TeamColumn */}
        <div
          style={{ gridColumn: '1 / 2', gridRow: '1 / 3', minHeight: 0, minWidth: 0 }}
        >
          {focusMon ? (
            <FocusLens mon={focusMon} />
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="glass rounded-[16px] px-5 py-6 text-center max-w-[260px]">
                <div className="font-display text-[16px] font-bold text-[var(--ink-0)] mb-1.5">
                  No squad yet
                </div>
                <div className="font-mono-hud text-[13px] text-[var(--ink-2)] leading-relaxed mb-3">
                  Build a team to see it on your dashboard.
                </div>
                <button
                  type="button"
                  className="chunky font-display text-[12px]"
                  style={{ padding: '6px 14px' }}
                  onClick={() => setOpenTool('team')}
                >
                  ◢ OPEN TEAM BUILDER
                </button>
              </div>
            </div>
          )}
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
          {hudTeam.length > 0 ? (
            <TeamColumn
              team={hudTeam}
              activeId={activeMonId}
              synced={bridgeStatus?.kind === 'connected'}
              onPick={(id) => {
                setActiveMonId(id);
                setHoverMonId(null);
              }}
              onHover={setHoverMonId}
            />
          ) : (
            <button
              type="button"
              className="glass rounded-[14px] px-4 py-5 text-center w-[170px] cursor-pointer hover:brightness-110 transition"
              onClick={() => setOpenTool('team')}
              title="Build a team in the Team Builder"
            >
              <div className="text-[26px] leading-none mb-2 text-[var(--hud-accent)]">＋</div>
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-1)]">
                Add a team
              </div>
            </button>
          )}
        </div>

        {/* ROW 3 - Telemetry strip + key hint */}
        <div
          style={{ gridColumn: '1 / 4', gridRow: '3 / 4' }}
          className="flex items-end justify-between gap-4 flex-wrap"
        >
          <TelemetryStrip bridgeStatus={bridgeStatus} />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleFx}
              title={
                perfLite
                  ? 'Effects reduced for performance - click for full visuals'
                  : 'Click to reduce effects (faster on weak GPUs)'
              }
              className="key-hint cursor-pointer"
              style={{ border: 'none' }}
            >
              <span>
                <span style={{ color: perfLite ? 'var(--hud-accent)' : 'var(--hud-accent-2)' }}>
                  FX
                </span>{' '}
                {perfLite ? 'lite' : 'full'}
              </span>
            </button>
            <div className="key-hint" title="Shortcuts: click a hex around the orb to open that tool, Esc closes it, number keys 1–6 set your lead Pokémon">
              <span>
                <span style={{ color: 'var(--hud-accent)' }}>CLICK HEX</span> open tool
              </span>
              <span className="sep">·</span>
              <span>
                <span style={{ color: 'var(--hud-accent-2)' }}>ESC</span> close
              </span>
              <span className="sep">·</span>
              <span>
                <span style={{ color: '#fff' }}>1–6</span> set lead
              </span>
            </div>
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
          <div className="ds">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <div className="mono-panel px-4 py-2 rounded-full text-[14px]">
                    ◢ LOADING MODULE…
                  </div>
                </div>
              }
            >
              {diveModule}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
