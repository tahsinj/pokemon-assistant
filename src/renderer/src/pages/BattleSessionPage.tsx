import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Pokemon, StatKey } from '../lib/types';
import {
  emptyBattleState,
  getActive,
  makeId,
  makePokemon,
  parseId,
  type BattlePokemon,
  type BattleState,
  type PokemonId,
  type SideId,
  type StatusCondition,
} from '../lib/battle/state';
import { applyEvent, type BattleEvent } from '../lib/battle/events';
import { teamDamageVsOpponent } from '../lib/battle/stateBridge';
import type { DamageOutcome } from '../lib/battle/damage';
import { applyEventAndPredict, topCandidates } from '../lib/battle/predictor/predictor';
import type { PredictorContext } from '../lib/battle/predictor/types';
import { buildSmogonSetPool } from '../lib/battle/predictor/smogonPriors';
import type { SmogonBundle } from '../lib/smogon';
import { recommend } from '../lib/battle/search/expectimax';
import type { Recommendation, SearchOptions } from '../lib/battle/search/types';
import { parseShowdownTeam } from '../lib/showdownTeam';
import { buildSpeciesFuse, resolveSpeciesName } from '../lib/fuzzySpecies';
import { suggestMoveset } from '../lib/recommender';
import { TYPES } from '../lib/typechart';
import { useModBridge } from '../lib/battle/mod/useModBridge';
import type { ModBridgeStatus } from '../lib/bridgeTypes';
import { usePcCollection } from '../lib/usePcCollection';
import { fromPcRecord, fromTeamMember, toSessionSpec, type CombatImportInput } from '../lib/toCombatSpec';
import { getTeamDraft } from '../lib/teamDraft';
import { ModuleFrame } from '../components/hud/ModuleFrame';

type Terrain = '' | 'Electric' | 'Grassy' | 'Misty' | 'Psychic';
type Weather =
  | ''
  | 'Sun'
  | 'Rain'
  | 'Sand'
  | 'Snow'
  | 'Hail'
  | 'Harsh Sunshine'
  | 'Heavy Rain'
  | 'Strong Winds';

const WEATHERS: Weather[] = ['', 'Sun', 'Rain', 'Sand', 'Snow', 'Hail', 'Harsh Sunshine', 'Heavy Rain', 'Strong Winds'];
const TERRAINS: Terrain[] = ['', 'Electric', 'Grassy', 'Misty', 'Psychic'];
const TERA_TYPES = ['', ...TYPES.map((t) => t[0].toUpperCase() + t.slice(1))];

const STATUSES: { id: StatusCondition; label: string }[] = [
  { id: null, label: 'Healthy' },
  { id: 'brn', label: 'Burn' },
  { id: 'par', label: 'Paralyzed' },
  { id: 'psn', label: 'Poisoned' },
  { id: 'tox', label: 'Badly poisoned' },
  { id: 'slp', label: 'Asleep' },
  { id: 'frz', label: 'Frozen' },
];

const BOOST_STATS: (StatKey | 'acc' | 'eva')[] = ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva'];

const STATUS_BADGE: Record<NonNullable<StatusCondition>, { label: string; color: string }> = {
  brn: { label: 'BRN', color: '#dc2626' },
  par: { label: 'PAR', color: '#eab308' },
  psn: { label: 'PSN', color: '#9333ea' },
  tox: { label: 'TOX', color: '#7e22ce' },
  slp: { label: 'SLP', color: '#64748b' },
  frz: { label: 'FRZ', color: '#38bdf8' },
};

export function BattleSessionPage({
  pokemon,
  moves,
  smogon,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
}) {
  const [state, setState] = useState<BattleState>(() => emptyBattleState());
  const [paste, setPaste] = useState('');
  const [parseMsg, setParseMsg] = useState<string | null>(null);

  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);
  const pokemonByName = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.name.toLowerCase()] = p;
    return m;
  }, [pokemon]);

  // Usage-statistics-backed opponent set priors .
  // Species not in the bundle fall back to the archetype generator.
  const customSetPool = useMemo(() => {
    if (!smogon) return undefined;
    const byId: Record<string, Pokemon> = {};
    for (const p of pokemon) byId[p.id] = p;
    return buildSmogonSetPool(smogon, byId);
  }, [smogon, pokemon]);

  const predictorCtx = useMemo<PredictorContext>(
    () => ({ pokemonByName, moves, customSetPool }),
    [pokemonByName, moves, customSetPool],
  );

  const dispatch = useCallback(
    (event: BattleEvent) => {
      setState((s) => applyEventAndPredict(s, event, predictorCtx));
    },
    [predictorCtx],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const onModEvents = useCallback(
    (events: BattleEvent[]) => {
      if (events.length === 0) return;
      // Apply events as a batch so the predictor sees the whole frame at once
      // - important when a `pokemon-revealed` is followed by an immediate
      // `ability-revealed` from the same wire frame.
      setState((s) => {
        let next = s;
        for (const ev of events) next = applyEventAndPredict(next, ev, predictorCtx);
        return next;
      });
    },
    [predictorCtx],
  );

  const modBridge = useModBridge({
    pokemonByName,
    stateRef,
    onEvents: onModEvents,
  });

  // -------------------------------------------------------------------------
  // Setup actions
  // -------------------------------------------------------------------------
  const onResetBattle = () => {
    setState(emptyBattleState());
    setParseMsg(null);
  };

  const onLoadPlayerTeam = () => {
    setParseMsg(null);
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setParseMsg('No Pokémon blocks found. Paste a Showdown export (blank line between species).');
      return;
    }
    let next = emptyBattleState();
    const misses: string[] = [];
    parsed.slice(0, 6).forEach((block, slot) => {
      const species = resolveSpeciesName(fuse, block.species);
      if (!species) {
        misses.push(block.species);
        return;
      }
      const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
      const moveList = block.moves.length ? block.moves : fallback;
      const p = makePokemon(
        species,
        {
          speciesName: species.name,
          level: block.level ?? 50,
          nature: block.nature ?? 'Hardy',
          ability: block.ability ?? species.abilities[0] ?? null,
          item: block.item ?? null,
          ivs: block.ivs as never,
          evs: block.evs as never,
          moves: moveList.slice(0, 4).map((name) => ({ name })),
        },
        makeId('player', slot),
        { isOpponent: false, source: 'KNOWN' },
      );
      next = applyEvent(next, { type: 'PokemonRevealed', side: 'player', slot, pokemon: p });
    });
    setState(next);
    setParseMsg(
      misses.length
        ? `Loaded ${parsed.length - misses.length}/${parsed.length}. Unmatched: ${misses.join(', ')}`
        : `Loaded ${parsed.length} Pokémon to your side.`,
    );
  };

  // Player-team import from stored sources (PC boxes / saved teams / builder draft).
  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);
  const pc = usePcCollection();
  const [savedTeams, setSavedTeams] = useState<{ id: string; name: string }[]>([]);
  const bridge2 = typeof window !== 'undefined' ? window.cobblemon : undefined;
  useEffect(() => {
    if (!bridge2?.teamsList) return;
    bridge2
      .teamsList()
      .then((rows) => setSavedTeams(rows.map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setSavedTeams([]));
  }, [bridge2]);

  const loadPlayerFromInputs = (inputs: CombatImportInput[], label: string) => {
    let next = emptyBattleState();
    let count = 0;
    inputs.slice(0, 6).forEach((input) => {
      const species =
        (input.speciesId && pokemonById[input.speciesId]) ||
        pokemonByName[input.speciesDisplay.toLowerCase()] ||
        resolveSpeciesName(fuse, input.speciesDisplay);
      if (!species) return;
      const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
      const spec = toSessionSpec(input, species, fallback);
      const p = makePokemon(
        species,
        spec as never,
        makeId('player', count),
        { isOpponent: false, source: 'KNOWN' },
      );
      next = applyEvent(next, { type: 'PokemonRevealed', side: 'player', slot: count, pokemon: p });
      count++;
    });
    setState(next);
    setParseMsg(`Loaded ${count} Pokémon from ${label}.`);
  };

  const onImportSavedTeam = async (id: string) => {
    if (!bridge2?.teamsLoad) return;
    const rec = await bridge2.teamsLoad(id);
    if (!rec) return;
    loadPlayerFromInputs(
      rec.members.filter((m) => m.speciesId).map((m) => fromTeamMember(m)),
      `“${rec.name}”`,
    );
  };

  /** Add one stored mon to the next empty player slot (pre-battle only). */
  const appendPlayerFromInput = (input: CombatImportInput) => {
    const slot = state.sides.player.team.findIndex((p) => !p);
    if (slot < 0) {
      setParseMsg('All six player slots are filled.');
      return;
    }
    const species =
      (input.speciesId && pokemonById[input.speciesId]) ||
      pokemonByName[input.speciesDisplay.toLowerCase()] ||
      resolveSpeciesName(fuse, input.speciesDisplay);
    if (!species) return;
    const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
    const p = makePokemon(
      species,
      toSessionSpec(input, species, fallback) as never,
      makeId('player', slot),
      { isOpponent: false, source: 'KNOWN' },
    );
    dispatch({ type: 'PokemonRevealed', side: 'player', slot, pokemon: p });
    setParseMsg(`Added ${species.name} to slot ${slot + 1}.`);
  };

  const onImportBuilderDraft = () => {
    const draft = getTeamDraft().filter((d): d is NonNullable<typeof d> => !!d);
    if (!draft.length) {
      setParseMsg('Team Builder has no squad in progress.');
      return;
    }
    loadPlayerFromInputs(
      draft.map((d) =>
        fromTeamMember({
          slot: 0,
          speciesId: d.speciesId,
          speciesDisplay: pokemonById[d.speciesId]?.name ?? d.speciesId,
          item: d.detail?.item ?? null,
          ability: d.detail?.ability ?? null,
          nature: d.detail?.nature ?? null,
          evs: d.detail?.evs ?? null,
          moves: d.detail?.moves ?? null,
        }),
      ),
      'Team Builder',
    );
  };

  const onRevealOpponent = (slot: number, speciesName: string, level: number) => {
    const species = pokemonByName[speciesName.toLowerCase()] ?? resolveSpeciesName(fuse, speciesName);
    if (!species) return;
    const fallback = suggestMoveset(species, moves)
      .slice(0, 4)
      .map((s) => ({ name: s.move.name }));
    const p = makePokemon(
      species,
      {
        speciesName: species.name,
        level,
        nature: 'Hardy',
        ability: null,
        item: null,
        moves: fallback,
      },
      makeId('opponent', slot),
      { isOpponent: true, source: 'DEFAULT' },
    );
    dispatch({ type: 'PokemonRevealed', side: 'opponent', slot, pokemon: p });
  };

  const onStartBattle = () => {
    // Pick the first alive slot per side as starting active.
    const pickFirst = (side: SideId) => state.sides[side].team.findIndex((p) => !!p);
    const playerStart = Math.max(0, pickFirst('player'));
    const opponentStart = Math.max(0, pickFirst('opponent'));
    dispatch({
      type: 'BattleStarted',
      startingActive: { player: playerStart, opponent: opponentStart },
    });
  };

  const battleStarted = state.turn > 0;

  // -------------------------------------------------------------------------
  // Damage panel - your team × opponent active
  // -------------------------------------------------------------------------
  const matrix = useMemo(() => (battleStarted ? teamDamageVsOpponent(state) : []), [state, battleStarted]);

  const bridgeKind = modBridge.status.kind;
  return (
    <ModuleFrame
      kicker="◢ LIVE SESSION"
      title="Battle Tracker"
      subtitle={
        battleStarted
          ? `Turn ${state.turn}${state.field.weather ? ` · ${state.field.weather}` : ''}${
              state.field.terrain ? ` · ${state.field.terrain} terrain` : ''
            }`
          : 'Load your team, reveal the opponent, record events as the battle unfolds'
      }
      side={
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={
              bridgeKind === 'connected'
                ? {
                    background: 'var(--hud-danger)',
                    boxShadow: '0 0 8px var(--hud-danger)',
                    animation: 'hud-breathe 1s ease-in-out infinite',
                  }
                : bridgeKind === 'listening'
                  ? { background: 'var(--hud-accent)', boxShadow: '0 0 8px var(--hud-accent)' }
                  : { background: 'var(--ink-2)' }
            }
          />
          <span
            className="font-mono-hud text-[14px] uppercase tracking-widest"
            style={{
              color:
                bridgeKind === 'connected'
                  ? 'var(--hud-danger)'
                  : bridgeKind === 'listening'
                    ? 'var(--hud-accent)'
                    : 'var(--ink-2)',
            }}
          >
            {bridgeKind === 'connected' ? 'LIVE' : bridgeKind === 'listening' ? 'LINK READY' : 'OFFLINE'}
          </span>
        </div>
      }
    >
      <div className="mod-page hud-form">
      <TopBar state={state} dispatch={dispatch} battleStarted={battleStarted} onReset={onResetBattle} />

      <ModBridgePanel
        status={modBridge.status}
        available={modBridge.available}
        invalidFrames={modBridge.invalidFrames}
        start={modBridge.start}
        stop={modBridge.stop}
      />

      {!battleStarted && (
        <SetupPanel
          paste={paste}
          onPaste={setPaste}
          onLoadPlayerTeam={onLoadPlayerTeam}
          parseMsg={parseMsg}
          pokemon={pokemon}
          state={state}
          onRevealOpponent={onRevealOpponent}
          onStartBattle={onStartBattle}
          importSources={
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {savedTeams.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) void onImportSavedTeam(e.target.value);
                  }}
                >
                  <option value="">From saved team…</option>
                  {savedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {pc.available && pc.mons.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const rec = pc.mons.find((r) => r.id === e.target.value);
                    if (rec) appendPlayerFromInput(fromPcRecord(rec));
                  }}
                >
                  <option value="">Add from PC…</option>
                  {pc.mons.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {(rec.nickname || rec.speciesDisplay) + ` · Lv ${rec.level}`}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onImportBuilderDraft}
                disabled={getTeamDraft().every((d) => d === null)}
              >
                From Team Builder
              </button>
            </div>
          }
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <TeamPanel side="player" state={state} dispatch={dispatch} battleStarted={battleStarted} />
        <TeamPanel
          side="opponent"
          state={state}
          dispatch={dispatch}
          battleStarted={battleStarted}
          pokemon={pokemon}
          fuse={fuse}
          onReveal={onRevealOpponent}
        />
      </div>

      <FieldStrip state={state} dispatch={dispatch} />

      {battleStarted && <EventComposer state={state} dispatch={dispatch} />}

      {battleStarted && <RecommendationsPanel state={state} ctx={predictorCtx} />}

      {battleStarted && <DamageMatrix matrix={matrix} state={state} />}

      <EventLog state={state} />
      </div>
    </ModuleFrame>
  );
}

// ---------------------------------------------------------------------------
// Top bar - turn, weather/terrain, "End turn", reset
// ---------------------------------------------------------------------------
function TopBar({
  state,
  dispatch,
  battleStarted,
  onReset,
}: {
  state: BattleState;
  dispatch: (e: BattleEvent) => void;
  battleStarted: boolean;
  onReset: () => void;
}) {
  return (
    <div
      className="panel"
      style={{
        display: 'flex',
        gap: 16,
        alignItems: 'center',
        padding: '10px 14px',
        marginBottom: 12,
        flexWrap: 'wrap',
      }}
    >
      <strong style={{ fontSize: 18 }}>Turn {state.turn || '-'}</strong>
      <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>
        {state.field.weather ? `Weather: ${state.field.weather} (${state.field.weatherTurns}t)` : 'No weather'}
        {' · '}
        {state.field.terrain ? `Terrain: ${state.field.terrain} (${state.field.terrainTurns}t)` : 'No terrain'}
        {state.field.isTrickRoom && ' · Trick Room'}
        {state.field.isGravity && ' · Gravity'}
      </span>
      {state.isOver && (
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            background: state.winner === 'player' ? 'var(--ok)' : 'var(--danger)',
            color: '#0f172a',
            fontWeight: 700,
          }}
        >
          {state.winner === 'player' ? 'YOU WIN' : state.winner === 'opponent' ? 'YOU LOST' : 'TIE'}
        </span>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {battleStarted && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'TurnStarted', turn: state.turn + 1 })}
          >
            End turn → Turn {state.turn + 1}
          </button>
        )}
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup panel - only shown before the battle starts
// ---------------------------------------------------------------------------
function SetupPanel({
  paste,
  onPaste,
  onLoadPlayerTeam,
  parseMsg,
  pokemon,
  state,
  onRevealOpponent,
  onStartBattle,
  importSources,
}: {
  paste: string;
  onPaste: (s: string) => void;
  onLoadPlayerTeam: () => void;
  importSources?: React.ReactNode;
  parseMsg: string | null;
  pokemon: Pokemon[];
  state: BattleState;
  onRevealOpponent: (slot: number, name: string, level: number) => void;
  onStartBattle: () => void;
}) {
  const [oppName, setOppName] = useState('');
  const [oppLevel, setOppLevel] = useState(50);
  const playerLoaded = state.sides.player.team.some((p) => p);
  const opponentLoaded = state.sides.opponent.team.some((p) => p);
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div className="section-head">Setup</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 6 }}>1. Load your team</div>
          <textarea
            value={paste}
            onChange={(e) => onPaste(e.target.value)}
            placeholder={
              'Paste a Showdown export…\n\nGarchomp @ Choice Band\nAbility: Rough Skin\nEVs: 4 HP / 252 Atk / 252 Spe\nJolly Nature\n- Earthquake\n- Outrage'
            }
            rows={8}
            style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
          <button type="button" className="btn btn-primary" onClick={onLoadPlayerTeam} style={{ marginTop: 6 }}>
            Load player team
          </button>
          {importSources}
          {parseMsg && (
            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--fg-dim)' }} role="status">
              {parseMsg}
            </p>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: 'var(--fg-dim)', marginBottom: 6 }}>2. Reveal opponent lead</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              list="setup-species"
              value={oppName}
              onChange={(e) => setOppName(e.target.value)}
              placeholder="Species (e.g. Tatsugiri)"
              style={{ flex: 1 }}
            />
            <input
              type="number"
              min={1}
              max={100}
              value={oppLevel}
              onChange={(e) => setOppLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
              style={{ width: 70 }}
            />
            <button
              type="button"
              onClick={() => {
                if (oppName.trim()) {
                  onRevealOpponent(0, oppName.trim(), oppLevel);
                  setOppName('');
                }
              }}
            >
              Reveal
            </button>
          </div>
          <datalist id="setup-species">
            {pokemon.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            More opponent slots can be revealed once they switch in.
          </div>
          <div style={{ marginTop: 12, fontSize: 12 }}>
            Player loaded: <strong>{playerLoaded ? 'yes' : 'no'}</strong> · Opponent lead revealed:{' '}
            <strong>{opponentLoaded ? 'yes' : 'no'}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!playerLoaded || !opponentLoaded}
            onClick={onStartBattle}
            style={{ marginTop: 12 }}
          >
            Start battle
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team panel - 6 slots per side
// ---------------------------------------------------------------------------
function TeamPanel({
  side,
  state,
  dispatch,
  battleStarted,
  pokemon,
  fuse,
  onReveal,
}: {
  side: SideId;
  state: BattleState;
  dispatch: (e: BattleEvent) => void;
  battleStarted: boolean;
  pokemon?: Pokemon[];
  fuse?: ReturnType<typeof buildSpeciesFuse>;
  onReveal?: (slot: number, name: string, level: number) => void;
}) {
  const team = state.sides[side].team;
  const active = state.activeSlot[side];
  const sideLabel = side === 'player' ? 'Your team' : 'Opponent';

  return (
    <div className="panel">
      <div className="section-head">{sideLabel}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {team.map((p, slot) => (
          <SlotCard
            key={slot}
            side={side}
            slot={slot}
            pokemon={p}
            isActive={slot === active && battleStarted}
            dispatch={dispatch}
            battleStarted={battleStarted}
            speciesList={pokemon}
            fuse={fuse}
            onReveal={onReveal}
          />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  side,
  slot,
  pokemon,
  isActive,
  dispatch,
  battleStarted,
  speciesList,
  fuse,
  onReveal,
}: {
  side: SideId;
  slot: number;
  pokemon: BattlePokemon | null;
  isActive: boolean;
  dispatch: (e: BattleEvent) => void;
  battleStarted: boolean;
  speciesList?: Pokemon[];
  fuse?: ReturnType<typeof buildSpeciesFuse>;
  onReveal?: (slot: number, name: string, level: number) => void;
}) {
  const [revealName, setRevealName] = useState('');
  const [revealLevel, setRevealLevel] = useState(50);

  if (!pokemon) {
    if (side === 'opponent' && onReveal) {
      return (
        <div
          style={{
            padding: 8,
            borderRadius: 6,
            border: '1px dashed var(--border)',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--fg-dim)', width: 50 }}>Slot {slot + 1}</span>
          <input
            list={`reveal-${slot}`}
            placeholder="Reveal species…"
            value={revealName}
            onChange={(e) => setRevealName(e.target.value)}
            style={{ flex: 1, fontSize: 11, padding: '2px 6px' }}
          />
          <input
            type="number"
            min={1}
            max={100}
            value={revealLevel}
            onChange={(e) => setRevealLevel(Math.max(1, Math.min(100, Number(e.target.value) || 50)))}
            style={{ width: 50, fontSize: 11, padding: '2px 6px' }}
          />
          <button
            type="button"
            onClick={() => {
              if (revealName.trim()) {
                onReveal(slot, revealName.trim(), revealLevel);
                setRevealName('');
              }
            }}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            +
          </button>
          {speciesList && (
            <datalist id={`reveal-${slot}`}>
              {speciesList.map((p) => (
                <option key={p.id} value={p.name} />
              ))}
            </datalist>
          )}
        </div>
      );
    }
    return (
      <div
        style={{
          padding: 8,
          borderRadius: 6,
          border: '1px dashed var(--border)',
          color: 'var(--fg-dim)',
          fontSize: 11,
        }}
      >
        Empty slot {slot + 1}
      </div>
    );
  }

  const pct = pokemon.battle.maxHP > 0 ? (pokemon.battle.currentHP / pokemon.battle.maxHP) * 100 : 0;
  const fainted = pokemon.battle.currentHP <= 0;
  const boostsList = Object.entries(pokemon.battle.boosts)
    .filter(([, v]) => v && v !== 0)
    .map(([k, v]) => `${(v as number) > 0 ? '+' : ''}${v} ${k}`)
    .join(', ');

  return (
    <div
      style={{
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${isActive ? 'var(--hud-accent)' : 'rgba(255,255,255,.10)'}`,
        background: isActive
          ? 'rgba(255,198,54,0.07)'
          : fainted
            ? 'rgba(255,91,108,0.05)'
            : 'rgba(255,255,255,.04)',
        opacity: fainted ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <strong className="font-display" style={{ fontSize: 14, color: 'var(--ink-0)' }}>
          {pokemon.identity.species}
        </strong>
        <span className="font-mono-hud" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
          L{pokemon.identity.level}
        </span>
        {pokemon.battle.status && (
          <span
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 3,
              background: STATUS_BADGE[pokemon.battle.status].color,
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {STATUS_BADGE[pokemon.battle.status].label}
          </span>
        )}
        {pokemon.battle.isTerastallized && (
          <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-alt)' }}>
            TERA {pokemon.set.teraType.value || '?'}
          </span>
        )}
        {fainted && (
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)' }}>FAINTED</span>
        )}
        {isActive && (
          <span
            className="font-mono-hud"
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              padding: '0 6px',
              borderRadius: 999,
              background: 'var(--hud-accent)',
              color: '#100b06',
            }}
          >
            ACTIVE
          </span>
        )}
        {!isActive && battleStarted && !fainted && (
          <button
            type="button"
            onClick={() => dispatch({ type: 'Switched', side, toSlot: slot })}
            style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px' }}
          >
            Switch in
          </button>
        )}
      </div>
      <div style={{ height: 6, background: 'rgba(0,0,0,.6)', borderRadius: 999, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: pct > 50 ? '#7cd87b' : pct > 20 ? '#ffb84d' : '#ff5b6c',
            boxShadow: `0 0 6px ${pct > 50 ? '#7cd87b' : pct > 20 ? '#ffb84d' : '#ff5b6c'}`,
            transition: 'width 0.2s',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--fg-dim)', marginTop: 2 }}>
        <span>
          {pokemon.battle.currentHP} / {pokemon.battle.maxHP} HP
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      {boostsList && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--accent)' }}>
          {boostsList}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--fg-dim)' }}>
        {pokemon.set.ability.value ? `${pokemon.set.ability.value}` : '?'}
        {pokemon.set.item.value ? ` · ${pokemon.set.item.value}` : ''}
      </div>
      {side === 'opponent' && pokemon.uncertainty && <PredictedSetsPanel pokemon={pokemon} />}
    </div>
  );
}

function PredictedSetsPanel({ pokemon }: { pokemon: BattlePokemon }) {
  if (!pokemon.uncertainty) return null;
  const top = topCandidates(pokemon.uncertainty, 3);
  if (!top.length) return null;
  const confidencePct = Math.round(pokemon.uncertainty.confidence * 100);
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 10, color: 'var(--fg-dim)', cursor: 'pointer' }}>
        Predicted sets ({top.length} live) · confidence {confidencePct}%
      </summary>
      <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {top.map((c) => (
          <div
            key={c.id}
            style={{
              fontSize: 10,
              background: '#020617',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <strong style={{ fontSize: 10 }}>{c.label}</strong>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>
                {Math.round(c.weight * 100)}%
              </span>
            </div>
            <div style={{ height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 4 }}>
              <div
                style={{
                  width: `${c.weight * 100}%`,
                  height: '100%',
                  background: 'var(--accent)',
                }}
              />
            </div>
            <div style={{ color: 'var(--fg-dim)' }}>
              {c.nature} · {c.ability}
              {c.item ? ` · ${c.item}` : ''}
              {c.teraType ? ` · Tera ${c.teraType}` : ''}
            </div>
            <div style={{ color: 'var(--fg-dim)' }}>{c.moves.join(', ')}</div>
          </div>
        ))}
        {pokemon.uncertainty.evidence.length > 1 && (
          <details>
            <summary style={{ fontSize: 9, color: 'var(--fg-dim)', cursor: 'pointer' }}>
              Evidence trail ({pokemon.uncertainty.evidence.length})
            </summary>
            <ul style={{ margin: '4px 0 0 14px', padding: 0, fontSize: 9, color: 'var(--fg-dim)' }}>
              {pokemon.uncertainty.evidence.slice(-6).map((e, i) => (
                <li key={i}>
                  <strong>{e.observation}:</strong> {e.effect}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Field strip - hazards/screens for both sides + room toggles
// ---------------------------------------------------------------------------
function FieldStrip({ state, dispatch }: { state: BattleState; dispatch: (e: BattleEvent) => void }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-head">Field state</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FieldGlobal state={state} dispatch={dispatch} />
        <SideField label="Your side" side="player" state={state} dispatch={dispatch} />
        <SideField label="Opponent side" side="opponent" state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

function FieldGlobal({ state, dispatch }: { state: BattleState; dispatch: (e: BattleEvent) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, textTransform: 'uppercase' }}>Global</div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Weather</span>
        <select
          value={state.field.weather}
          onChange={(e) =>
            dispatch({ type: 'WeatherChanged', weather: e.target.value as Weather })
          }
        >
          {WEATHERS.map((w) => (
            <option key={w || 'none'} value={w}>
              {w || '-'}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Terrain</span>
        <select
          value={state.field.terrain}
          onChange={(e) =>
            dispatch({ type: 'TerrainChanged', terrain: e.target.value as Terrain })
          }
        >
          {TERRAINS.map((t) => (
            <option key={t || 'none'} value={t}>
              {t || '-'}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        <label>
          <input
            type="checkbox"
            checked={state.field.isTrickRoom}
            onChange={(e) =>
              dispatch({ type: 'RoomChanged', room: 'trick', active: e.target.checked })
            }
          />{' '}
          Trick Room
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.field.isGravity}
            onChange={(e) => dispatch({ type: 'GravityChanged', active: e.target.checked })}
          />{' '}
          Gravity
        </label>
      </div>
    </div>
  );
}

function SideField({
  label,
  side,
  state,
  dispatch,
}: {
  label: string;
  side: SideId;
  state: BattleState;
  dispatch: (e: BattleEvent) => void;
}) {
  const s = state.sides[side];
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <label>
          Spikes:{' '}
          <select
            value={s.hazards.spikes}
            onChange={(e) => {
              const target = Number(e.target.value);
              dispatch({ type: 'HazardCleared', side });
              for (let i = 0; i < target; i++)
                dispatch({ type: 'HazardSet', side, hazard: 'spikes' });
            }}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.hazards.stealthRock}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'HazardSet', side, hazard: 'stealthRock' })
                : dispatch({ type: 'HazardCleared', side })
            }
          />{' '}
          Stealth Rock
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.hazards.stickyWeb}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'HazardSet', side, hazard: 'stickyWeb' })
                : dispatch({ type: 'HazardCleared', side })
            }
          />{' '}
          Sticky Web
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.screens.reflect > 0}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'ScreenSet', side, screen: 'reflect' })
                : dispatch({ type: 'ScreenCleared', side, screen: 'reflect' })
            }
          />{' '}
          Reflect {s.screens.reflect > 0 ? `(${s.screens.reflect}t)` : ''}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.screens.lightScreen > 0}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'ScreenSet', side, screen: 'lightScreen' })
                : dispatch({ type: 'ScreenCleared', side, screen: 'lightScreen' })
            }
          />{' '}
          Light Screen {s.screens.lightScreen > 0 ? `(${s.screens.lightScreen}t)` : ''}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.screens.auroraVeil > 0}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'ScreenSet', side, screen: 'auroraVeil' })
                : dispatch({ type: 'ScreenCleared', side, screen: 'auroraVeil' })
            }
          />{' '}
          Aurora Veil {s.screens.auroraVeil > 0 ? `(${s.screens.auroraVeil}t)` : ''}
        </label>
        <label>
          <input
            type="checkbox"
            checked={s.tailwind > 0}
            onChange={(e) =>
              e.target.checked
                ? dispatch({ type: 'TailwindSet', side })
                : dispatch({ type: 'TailwindSet', side, turns: 0 })
            }
          />{' '}
          Tailwind {s.tailwind > 0 ? `(${s.tailwind}t)` : ''}
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event composer - quick controls to record what happened
// ---------------------------------------------------------------------------
type EventKind = 'damage' | 'heal' | 'status' | 'boost' | 'move' | 'tera' | 'item' | 'ability' | 'faint';

function EventComposer({ state, dispatch }: { state: BattleState; dispatch: (e: BattleEvent) => void }) {
  const [kind, setKind] = useState<EventKind>('damage');

  const allMons: { id: PokemonId; label: string }[] = useMemo(() => {
    const out: { id: PokemonId; label: string }[] = [];
    for (const side of ['player', 'opponent'] as const) {
      for (let slot = 0; slot < state.sides[side].team.length; slot++) {
        const p = state.sides[side].team[slot];
        if (!p) continue;
        out.push({
          id: makeId(side, slot),
          label: `${side === 'player' ? '🟦' : '🟥'} ${p.identity.species}${slot === state.activeSlot[side] ? ' (active)' : ''}`,
        });
      }
    }
    return out;
  }, [state]);

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-head">Record event</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {(
          [
            ['damage', 'Damage'],
            ['heal', 'Heal'],
            ['status', 'Status'],
            ['boost', 'Boost'],
            ['move', 'Move used'],
            ['tera', 'Terastallize'],
            ['item', 'Reveal item'],
            ['ability', 'Reveal ability'],
            ['faint', 'Faint'],
          ] as [EventKind, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={kind === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setKind(k)}
          >
            {label}
          </button>
        ))}
      </div>
      <DispatchForm kind={kind} mons={allMons} state={state} dispatch={dispatch} />
    </div>
  );
}

function DispatchForm({
  kind,
  mons,
  state,
  dispatch,
}: {
  kind: EventKind;
  mons: { id: PokemonId; label: string }[];
  state: BattleState;
  dispatch: (e: BattleEvent) => void;
}) {
  const [target, setTarget] = useState<PokemonId>(mons[0]?.id ?? ('p:0' as PokemonId));
  useEffect(() => {
    if (mons.length && !mons.some((m) => m.id === target)) setTarget(mons[0].id);
  }, [mons, target]);
  const [amount, setAmount] = useState(0);
  const [pctMode, setPctMode] = useState(true);
  const [status, setStatus] = useState<StatusCondition>('brn');
  const [boostStat, setBoostStat] = useState<StatKey | 'acc' | 'eva'>('atk');
  const [boostDelta, setBoostDelta] = useState(1);
  const [moveName, setMoveName] = useState('');
  const [teraType, setTeraType] = useState('');
  const [itemName, setItemName] = useState('');
  const [abilityName, setAbilityName] = useState('');

  const targetMon: BattlePokemon | null = (() => {
    if (!target) return null;
    const { side, slot } = parseId(target);
    return state.sides[side].team[slot] ?? null;
  })();

  if (!mons.length) {
    return <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>Reveal Pokémon to enable events.</div>;
  }

  const targetPicker = (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Target</span>
      <select value={target} onChange={(e) => setTarget(e.target.value as PokemonId)}>
        {mons.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );

  switch (kind) {
    case 'damage':
    case 'heal': {
      const computeAmount = () => {
        if (!pctMode) return amount;
        if (!targetMon) return amount;
        return Math.round((amount / 100) * targetMon.battle.maxHP);
      };
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{kind === 'damage' ? 'Damage' : 'Heal'}</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Unit</span>
            <select value={pctMode ? 'pct' : 'hp'} onChange={(e) => setPctMode(e.target.value === 'pct')}>
              <option value="pct">% of max</option>
              <option value="hp">raw HP</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              const amt = computeAmount();
              if (amt <= 0) return;
              dispatch(
                kind === 'damage'
                  ? { type: 'Damaged', target, amount: amt }
                  : { type: 'Healed', target, amount: amt },
              );
            }}
          >
            Apply
          </button>
        </div>
      );
    }

    case 'status': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Status</span>
            <select value={status ?? ''} onChange={(e) => setStatus((e.target.value || null) as StatusCondition)}>
              {STATUSES.map((s) => (
                <option key={s.id ?? 'none'} value={s.id ?? ''}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (status === null) dispatch({ type: 'StatusCured', target });
              else dispatch({ type: 'StatusApplied', target, status });
            }}
          >
            Apply
          </button>
        </div>
      );
    }

    case 'boost': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Stat</span>
            <select value={boostStat} onChange={(e) => setBoostStat(e.target.value as typeof boostStat)}>
              {BOOST_STATS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Delta</span>
            <input
              type="number"
              min={-6}
              max={6}
              value={boostDelta}
              onChange={(e) => setBoostDelta(Math.max(-6, Math.min(6, Number(e.target.value) || 0)))}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'BoostChanged', target, stat: boostStat, delta: boostDelta })}
          >
            Apply
          </button>
        </div>
      );
    }

    case 'move': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Move</span>
            <input
              list={`move-known-${target}`}
              value={moveName}
              onChange={(e) => setMoveName(e.target.value)}
              placeholder="e.g. Earthquake"
            />
            {targetMon && (
              <datalist id={`move-known-${target}`}>
                {targetMon.set.moves.map((m) => (
                  <option key={m.name} value={m.name} />
                ))}
              </datalist>
            )}
          </label>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              if (moveName.trim()) {
                dispatch({ type: 'MoveUsed', actor: target, move: moveName.trim() });
                setMoveName('');
              }
            }}
          >
            Apply
          </button>
        </div>
      );
    }

    case 'tera': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Tera type</span>
            <select value={teraType} onChange={(e) => setTeraType(e.target.value)}>
              {TERA_TYPES.map((t) => (
                <option key={t || 'none'} value={t}>
                  {t || '- pick -'}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!teraType}
            onClick={() => {
              dispatch({ type: 'Terastallized', target, teraType });
              setTeraType('');
            }}
          >
            Apply
          </button>
        </div>
      );
    }

    case 'item': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Item</span>
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. Choice Specs"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!itemName.trim()}
            onClick={() => {
              dispatch({ type: 'ItemRevealed', target, item: itemName.trim() });
              setItemName('');
            }}
          >
            Reveal
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ItemConsumed', target })}
          >
            Mark consumed
          </button>
        </div>
      );
    }

    case 'ability': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Ability</span>
            <input
              value={abilityName}
              onChange={(e) => setAbilityName(e.target.value)}
              placeholder="e.g. Storm Drain"
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!abilityName.trim()}
            onClick={() => {
              dispatch({ type: 'AbilityRevealed', target, ability: abilityName.trim() });
              setAbilityName('');
            }}
          >
            Reveal
          </button>
        </div>
      );
    }

    case 'faint': {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, alignItems: 'end' }}>
          {targetPicker}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'Fainted', target })}
          >
            Mark fainted
          </button>
        </div>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Damage matrix - your team vs the opposing active, live off state
// ---------------------------------------------------------------------------
function DamageMatrix({
  matrix,
  state,
}: {
  matrix: { id: PokemonId; pokemon: BattlePokemon; outcomes: DamageOutcome[] }[];
  state: BattleState;
}) {
  const opp = getActive(state, 'opponent');
  if (!opp) return null;
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-head">
        Damage vs {opp.identity.species} ({((opp.battle.currentHP / opp.battle.maxHP) * 100).toFixed(0)}% HP)
      </div>
      <p style={{ fontSize: 11, color: 'var(--fg-dim)', marginTop: 0 }}>
        Live calculation - reflects current boosts, status, hazards, screens, weather, and HP from the tracked state.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matrix.map(({ id, pokemon, outcomes }) => {
          const fainted = pokemon.battle.currentHP <= 0;
          if (!outcomes.length) return null;
          const sorted = [...outcomes].sort(
            (a, b) => b.ko.chance - a.ko.chance || b.pctMax - a.pctMax,
          );
          return (
            <div
              key={id}
              style={{
                padding: 10,
                background: 'var(--bg-3)',
                borderRadius: 6,
                opacity: fainted ? 0.45 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <strong>{pokemon.identity.species}</strong>
                <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
                  L{pokemon.identity.level} {pokemon.set.nature}
                  {pokemon.set.item.value ? ` · ${pokemon.set.item.value}` : ''}
                  {pokemon.set.ability.value ? ` · ${pokemon.set.ability.value}` : ''}
                </span>
                {fainted && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700 }}>FAINTED</span>}
              </div>
              <div>
                {sorted.map((o, i) => (
                  <DamageRow key={`${o.moveName}-${i}`} d={o} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DamageRow({ d }: { d: DamageOutcome }) {
  const color = d.error || d.isZero
    ? 'var(--fg-dim)'
    : d.ko.chance >= 1 && d.ko.n === 1
      ? 'var(--danger)'
      : d.ko.n === 1
        ? 'var(--warn)'
        : d.pctMax >= 50
          ? 'var(--accent)'
          : 'var(--fg)';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 50px 70px 100px 100px',
        gap: 8,
        alignItems: 'center',
        padding: '4px 6px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600 }}>{d.moveName}</span>
      <span style={{ color: 'var(--fg-dim)' }}>{d.category[0]}</span>
      <span style={{ color: 'var(--fg-dim)' }}>BP {d.basePower || '-'}</span>
      <span style={{ color, fontWeight: 600 }}>
        {d.error ? d.error : d.isZero ? '0' : `${d.pctMin.toFixed(1)}–${d.pctMax.toFixed(1)}%`}
      </span>
      <span style={{ color }}>{d.ko.text || (d.ko.chance >= 1 ? `${d.ko.n}HKO` : '-')}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------
function EventLog({ state }: { state: BattleState }) {
  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-head">◢ Turn log · {state.log.length} events</div>
      <div
        className="font-mono-hud"
        style={{ maxHeight: 240, overflow: 'auto', fontSize: 14, lineHeight: 1.45 }}
      >
        {state.log.length === 0 && (
          <div style={{ color: 'var(--ink-2)' }}>No events recorded yet.</div>
        )}
        {state.log.map((e, i) => (
          <div key={i} style={{ padding: '1px 0', color: 'var(--ink-1)' }}>
            <span style={{ color: 'var(--ink-2)', marginRight: 8 }}>› #{i + 1}</span>
            <span style={{ color: 'var(--ink-0)' }}>{e.type}</span>{' '}
            <span style={{ color: 'var(--ink-2)' }}>{summarizeEvent(e)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function summarizeEvent(e: BattleEvent): string {
  switch (e.type) {
    case 'BattleStarted':
      return `actives p:${e.startingActive.player} / o:${e.startingActive.opponent}`;
    case 'TurnStarted':
      return `turn ${e.turn}`;
    case 'PokemonRevealed':
      return `${e.side}:${e.slot} ${e.pokemon.identity.species} L${e.pokemon.identity.level}`;
    case 'Switched':
      return `${e.side} → slot ${e.toSlot}`;
    case 'MoveUsed':
      return `${e.actor} used ${e.move}`;
    case 'Damaged':
      return `${e.target} -${e.amount}${e.cause ? ` (${e.cause})` : ''}`;
    case 'Healed':
      return `${e.target} +${e.amount}${e.cause ? ` (${e.cause})` : ''}`;
    case 'StatusApplied':
      return `${e.target} ← ${e.status}`;
    case 'StatusCured':
      return `${e.target} cured`;
    case 'BoostChanged':
      return `${e.target} ${e.stat} ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'BoostsReset':
      return `${e.target} boosts cleared`;
    case 'VolatileSet':
      return `${e.target} +${e.volatile}`;
    case 'VolatileCleared':
      return `${e.target} -${e.volatile}`;
    case 'WeatherChanged':
      return e.weather || 'cleared';
    case 'TerrainChanged':
      return e.terrain || 'cleared';
    case 'RoomChanged':
      return `${e.room} ${e.active ? 'on' : 'off'}`;
    case 'GravityChanged':
      return e.active ? 'on' : 'off';
    case 'HazardSet':
      return `${e.side} +${e.hazard}`;
    case 'HazardCleared':
      return e.side ? `${e.side} cleared` : 'both sides cleared';
    case 'ScreenSet':
      return `${e.side} +${e.screen}`;
    case 'ScreenCleared':
      return `${e.side} -${e.screen}`;
    case 'TailwindSet':
      return `${e.side} tailwind ${e.turns ?? 4}t`;
    case 'AbilityRevealed':
      return `${e.target} = ${e.ability}`;
    case 'ItemRevealed':
      return `${e.target} = ${e.item}`;
    case 'ItemConsumed':
      return `${e.target} item gone`;
    case 'Terastallized':
      return `${e.target} → Tera ${e.teraType ?? '?'}`;
    case 'Fainted':
      return `${e.target} fainted`;
    case 'BattleEnded':
      return `winner: ${e.winner ?? 'none'}`;
    case 'TurnEnded':
      return '';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
function RecommendationsPanel({
  state,
  ctx,
}: {
  state: BattleState;
  ctx: PredictorContext;
}) {
  const [opts, setOpts] = useState<Pick<SearchOptions, 'depth' | 'topKSets' | 'includeSwitches'>>({
    depth: 2,
    topKSets: 3,
    includeSwitches: true,
  });

  // Recompute only when state.log length or options change - search is the
  // expensive op in the page, so we hash on log size.
  const recs = useMemo<Recommendation[]>(() => {
    if (state.isOver) return [];
    try {
      return recommend(state, ctx, opts);
    } catch (e) {
      console.warn('recommend() failed:', e);
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log.length, state.activeSlot.player, state.activeSlot.opponent, opts.depth, opts.topKSets, opts.includeSwitches]);

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Recommendations</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Depth
            <select
              value={opts.depth}
              onChange={(e) => setOpts((o) => ({ ...o, depth: Number(e.target.value) as 1 | 2 }))}
              style={{ padding: '2px 4px' }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            Sets
            <select
              value={opts.topKSets}
              onChange={(e) => setOpts((o) => ({ ...o, topKSets: Number(e.target.value) }))}
              style={{ padding: '2px 4px' }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={opts.includeSwitches}
              onChange={(e) => setOpts((o) => ({ ...o, includeSwitches: e.target.checked }))}
            />
            Switches
          </label>
        </div>
      </div>

      {recs.length === 0 && (
        <div style={{ color: 'var(--fg-dim)', fontSize: 13 }}>
          {state.isOver ? 'Battle is over.' : 'No legal actions.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {recs.map((r) => (
          <RecommendationCard key={r.rank} rec={r} />
        ))}
      </div>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showPV, setShowPV] = useState(false);
  const [showAlts, setShowAlts] = useState(false);

  const tone =
    rec.rank === 1
      ? { border: '1px solid var(--ok)', bg: 'rgba(75, 220, 110, 0.05)' }
      : { border: '1px solid var(--border)', bg: 'transparent' };

  return (
    <div
      style={{
        border: tone.border,
        background: tone.bg,
        borderRadius: 6,
        padding: 10,
        display: 'grid',
        gridTemplateColumns: '32px 1fr 130px',
        gap: 10,
        alignItems: 'start',
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: rec.rank === 1 ? 'var(--ok)' : 'var(--fg-dim)',
          textAlign: 'center',
        }}
      >
        #{rec.rank}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{rec.summary}</span>
          {rec.action.kind === 'move' && rec.action.tera && (
            <span style={{ fontSize: 11, color: 'var(--accent)' }}>(Tera)</span>
          )}
        </div>

        {/* Threat analysis - the central exchange summary */}
        {rec.threatAnalysis && (
          <div
            style={{
              marginTop: 6,
              padding: '6px 8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontSize: 12,
              display: 'grid',
              gap: 2,
            }}
          >
            {rec.threatAnalysis.outgoing && (
              <div>
                <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Out:</span>{' '}
                {rec.threatAnalysis.outgoing}
              </div>
            )}
            {rec.threatAnalysis.incoming && (
              <div>
                <span style={{ color: 'var(--warn)', fontWeight: 600 }}>In:</span>{' '}
                {rec.threatAnalysis.incoming}
              </div>
            )}
            <div style={{ color: 'var(--fg-dim)', fontStyle: 'italic' }}>
              {rec.threatAnalysis.netExchange}
            </div>
          </div>
        )}

        {rec.reasoning.length > 0 && (
          <ul style={{ margin: '6px 0 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--fg-dim)', display: 'grid', gap: 2 }}>
            {rec.reasoning.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {rec.risks.length > 0 && (
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--warn)', display: 'grid', gap: 2 }}>
            {rec.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}

        {/* Disclosure toggles */}
        <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 11 }}>
          {rec.principalVariation.length > 0 && (
            <DiscButton on={showPV} onClick={() => setShowPV((v) => !v)}>
              {showPV ? 'Hide' : 'Show'} projection ({rec.principalVariation.length})
            </DiscButton>
          )}
          {rec.assumptions.length > 0 && (
            <DiscButton on={showAssumptions} onClick={() => setShowAssumptions((v) => !v)}>
              {showAssumptions ? 'Hide' : 'Show'} assumptions ({rec.assumptions.length})
            </DiscButton>
          )}
          {rec.alternatives.length > 0 && (
            <DiscButton on={showAlts} onClick={() => setShowAlts((v) => !v)}>
              {showAlts ? 'Hide' : 'Show'} alternatives ({rec.alternatives.length})
            </DiscButton>
          )}
        </div>

        {showPV && rec.principalVariation.length > 0 && (
          <ol
            style={{
              margin: '6px 0 0 0',
              paddingLeft: 20,
              fontSize: 12,
              color: 'var(--fg-dim)',
              display: 'grid',
              gap: 2,
            }}
          >
            {rec.principalVariation.map((step, i) => (
              <li key={i}>
                <span
                  style={{
                    color: step.side === 'player' ? 'var(--accent)' : 'var(--accent-alt-2)',
                    fontWeight: 600,
                    marginRight: 6,
                  }}
                >
                  T{step.turn}
                </span>
                {step.text}
              </li>
            ))}
          </ol>
        )}

        {showAssumptions && rec.assumptions.length > 0 && (
          <ul
            style={{
              margin: '6px 0 0 0',
              paddingLeft: 18,
              fontSize: 11,
              color: 'var(--fg-dim)',
              display: 'grid',
              gap: 2,
            }}
          >
            {rec.assumptions.map((a, i) => (
              <li key={i}>
                <span style={{ color: 'var(--fg)' }}>{prettyAssumptionKind(a.kind)}:</span> {a.text}
                {a.probability != null && (
                  <span style={{ color: 'var(--accent)', marginLeft: 6 }}>
                    (p={Math.round(a.probability * 100)}%)
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {showAlts && rec.alternatives.length > 0 && (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {rec.alternatives.map((alt, i) => (
              <div
                key={i}
                style={{
                  fontSize: 12,
                  padding: '4px 8px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px dashed var(--border)',
                  borderRadius: 4,
                }}
              >
                <span style={{ fontWeight: 600 }}>Why not {alt.summary}?</span>{' '}
                <span style={{ color: 'var(--fg-dim)' }}>{alt.reasonItLost}</span>{' '}
                <span style={{ color: 'var(--fg-dim)', fontFamily: 'ui-monospace, monospace' }}>
                  (EV {alt.expectedValue.toFixed(2)}, Δ {alt.loss.toFixed(2)})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EV column */}
      <div style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>EV {rec.expectedValue.toFixed(2)}</div>
        {rec.rank > 1 ? (
          <div style={{ color: 'var(--fg-dim)' }}>Δ {rec.margin.toFixed(2)}</div>
        ) : (
          <ConfidenceMeter value={rec.confidence} />
        )}
      </div>
    </div>
  );
}

function DiscButton({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: on ? 'var(--bg-3)' : 'transparent',
        border: '1px solid var(--border)',
        color: 'var(--fg-dim)',
        padding: '2px 8px',
        borderRadius: 3,
        fontSize: 11,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'var(--ok)' : value >= 0.6 ? 'var(--warn)' : 'var(--fg-dim)';
  return (
    <div style={{ marginTop: 4, textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>confidence</div>
      <div style={{ fontWeight: 700, color, fontSize: 13 }}>{pct}%</div>
      <div
        style={{
          marginTop: 2,
          height: 4,
          background: 'var(--bg-3)',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div style={{ height: '100%', width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function prettyAssumptionKind(kind: string): string {
  switch (kind) {
    case 'opponent-set': return 'Opp set';
    case 'opponent-move': return 'Opp move';
    case 'damage-roll': return 'Damage';
    case 'crit': return 'Crit';
    case 'secondary': return 'Secondary';
    case 'speed-tie': return 'Speed tie';
    case 'tera-timing': return 'Tera';
    case 'switch': return 'Switching';
    default: return kind;
  }
}

// ---------------------------------------------------------------------------
// Mod bridge panel
//   Lets the user start/stop the local WebSocket listener that the companion
//   Cobblemon mod connects to. Shows live connection state and any frame
//   validation errors. Frames are auto-applied to the battle state.
// ---------------------------------------------------------------------------
function ModBridgePanel({
  status,
  available,
  invalidFrames,
  start,
  stop,
}: {
  status: ModBridgeStatus;
  available: boolean;
  invalidFrames: string[];
  start: () => Promise<{ url: string } | { error: string }>;
  stop: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-collapse when there's nothing interesting to show.
  const interesting = status.kind !== 'idle' || invalidFrames.length > 0;

  if (!available) {
    // Browser preview / running outside Electron - silently hide.
    return null;
  }

  const onStart = async () => {
    setBusy(true);
    setLastError(null);
    const res = await start();
    setBusy(false);
    if ('error' in res) setLastError(res.error);
  };

  const onStop = async () => {
    setBusy(true);
    await stop();
    setBusy(false);
  };

  const indicator = (() => {
    switch (status.kind) {
      case 'connected':
        return { label: 'Mod connected', color: 'var(--ok)', dot: '●' };
      case 'listening':
        return { label: 'Waiting for mod', color: '#eab308', dot: '◐' };
      case 'error':
        return { label: 'Bridge error', color: 'var(--danger)', dot: '●' };
      default:
        return { label: 'Mod disconnected', color: 'var(--fg-dim)', dot: '○' };
    }
  })();

  return (
    <div className="panel" style={{ marginBottom: 12, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ color: indicator.color, fontSize: 14, fontWeight: 700 }}>
          {indicator.dot} {indicator.label}
        </span>
        {status.kind === 'listening' && (
          <code style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{status.url}</code>
        )}
        {status.kind === 'connected' && status.hello && (
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
            {status.hello.modId} · Cobblemon {status.hello.cobblemonVersion} · MC{' '}
            {status.hello.minecraftVersion}
          </span>
        )}
        {status.kind === 'error' && (
          <span style={{ fontSize: 11, color: 'var(--danger)' }}>{status.message}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {status.kind === 'idle' || status.kind === 'error' ? (
            <button type="button" className="btn btn-primary" onClick={onStart} disabled={busy}>
              Start listener
            </button>
          ) : (
            <button type="button" onClick={onStop} disabled={busy}>
              Stop listener
            </button>
          )}
          {interesting && (
            <button type="button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide details' : 'Details'}
            </button>
          )}
        </div>
      </div>

      {lastError && (
        <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: 12 }}>{lastError}</div>
      )}

      {expanded && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-dim)' }}>
          <div>
            Mod-to-assistant bridge runs locally on <code>{`ws://127.0.0.1:8788/cobblemon`}</code>.
            Install the companion Cobblemon mod and point it at this URL.
          </div>
          {invalidFrames.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 700, color: 'var(--fg)' }}>Recent invalid frames</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {invalidFrames.map((e, i) => (
                  <li key={`${i}-${e}`}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
