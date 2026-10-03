/**
 * Calcdex - Showdex-style two-player damage workbench.
 * Two mirrored panels (you on top, opponent below) with a shared field bar
 * between them, sized so both dashboards fit on screen at once. Every roster
 * sprite is clickable; the active pair drives the move matrix damage/KO
 * readouts in both directions. Opponent sets auto-fill from Smogon usage and
 * can be swapped move-by-move; either roster can be imported from saved teams
 * / the Team Builder draft / a Showdown paste and saved back to the local
 * team store (opposing teams get the "opponent" tag).
 */
import { useEffect, useMemo, useState } from 'react';
import type { BaseStats, HeldItem, Move, Pokemon, StatKey } from '../lib/types';
import type { SmogonBundle, SmogonSpeciesIntel } from '../lib/smogon';
import type { SaveTeamPayload, TeamMemberPersist } from '../lib/bridgeTypes';
import {
  EMPTY_SIDE,
  NEUTRAL_EVS,
  NEUTRAL_IVS,
  type BattlePokemonSpec,
  type FieldSpec,
  type SideSpec,
  type Terrain,
  type Weather,
} from '../lib/battle/types';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import { NATURES, STAT_LABELS, calcAllStats } from '../lib/stats';
import { TYPES } from '../lib/typechart';
import { abilityName, findMove, moveName } from '../lib/displayNames';
import { allSetFills, sortMovesByUsage, usageFill, type SetFill } from '../lib/usageSets';
import { suggestMoveset } from '../lib/recommender';
import { buildSpeciesFuse, resolveSpeciesName } from '../lib/fuzzySpecies';
import { parseShowdownTeam, exportShowdownFromParsed, type ParsedShowdownMon } from '../lib/showdownTeam';
import { getTeamDraft } from '../lib/teamDraft';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { PokemonSprite } from '../components/PokemonSprite';
import { SpeciesList } from '../components/SpeciesList';
import { ItemSearchInput } from '../components/ItemSearchInput';

type StatusCode = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

const STATUSES: { id: StatusCode; label: string }[] = [
  { id: '', label: 'OK' },
  { id: 'brn', label: 'BRN' },
  { id: 'par', label: 'PAR' },
  { id: 'psn', label: 'PSN' },
  { id: 'tox', label: 'TOX' },
  { id: 'slp', label: 'SLP' },
  { id: 'frz', label: 'FRZ' },
];

const WEATHERS: { id: Weather; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'Sun', label: 'Sun' },
  { id: 'Rain', label: 'Rain' },
  { id: 'Sand', label: 'Sandstorm' },
  { id: 'Snow', label: 'Snow' },
  { id: 'Harsh Sunshine', label: 'Harsh Sunshine' },
  { id: 'Heavy Rain', label: 'Heavy Rain' },
  { id: 'Strong Winds', label: 'Strong Winds' },
];

const TERRAINS: { id: Terrain; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'Electric', label: 'Electric' },
  { id: 'Grassy', label: 'Grassy' },
  { id: 'Misty', label: 'Misty' },
  { id: 'Psychic', label: 'Psychic' },
];

const ALL_TERA_TYPES = TYPES.map((t) => t[0].toUpperCase() + t.slice(1));
const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const BOOSTABLE: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];

/** One fully-editable Pokémon in a Calcdex roster. */
interface CalcMon {
  species: Pokemon;
  level: number;
  nature: string;
  ability: string;
  item: string;
  teraType: string;
  isTera: boolean;
  hpPercent: number;
  status: StatusCode;
  ivs: BaseStats;
  evs: BaseStats;
  boosts: Partial<Record<StatKey, number>>;
  moves: [string, string, string, string];
  /** Which set the dropdown shows - 'custom' after any manual edit. */
  setLabel: string;
}

interface Screens {
  isReflect: boolean;
  isLightScreen: boolean;
  isAuroraVeil: boolean;
}

const NO_SCREENS: Screens = { isReflect: false, isLightScreen: false, isAuroraVeil: false };

type SideKey = 'p1' | 'p2';

interface PanelState {
  name: string;
  roster: (CalcMon | null)[];
  active: number;
}

function pad4(moves: string[]): [string, string, string, string] {
  const m = moves.slice(0, 4);
  while (m.length < 4) m.push('');
  return [m[0], m[1], m[2], m[3]];
}

function blankMon(species: Pokemon, fallbackMoves: string[]): CalcMon {
  return {
    species,
    level: 100,
    nature: 'Hardy',
    ability: species.abilities[0] ? abilityName(species.abilities[0]) : '',
    item: '',
    teraType: '',
    isTera: false,
    hpPercent: 100,
    status: '',
    ivs: { ...NEUTRAL_IVS },
    evs: { ...NEUTRAL_EVS },
    boosts: {},
    moves: pad4(fallbackMoves),
    setLabel: 'custom',
  };
}

function applyFill(mon: CalcMon, fill: SetFill): CalcMon {
  return {
    ...mon,
    nature: fill.nature ?? mon.nature,
    ability: fill.ability ? abilityName(fill.ability) : mon.ability,
    item: fill.item ?? '',
    teraType: fill.teraType ?? mon.teraType,
    ivs: { ...fill.ivs },
    evs: { ...fill.evs },
    moves: pad4(fill.moves),
    setLabel: fill.label,
  };
}

function toBattleSpec(m: CalcMon): BattlePokemonSpec {
  return {
    speciesName: m.species.name,
    level: m.level,
    nature: m.nature,
    ability: m.ability || undefined,
    item: m.item || undefined,
    teraType: m.teraType || undefined,
    isTerastallized: m.isTera && !!m.teraType,
    ivs: m.ivs,
    evs: m.evs,
    moves: m.moves.filter((x) => x.trim()).map((name) => ({ name })),
    currentHPPercent: m.hpPercent,
    status: m.status || undefined,
    boosts: m.boosts,
  };
}

function toPersistMember(m: CalcMon | null, slot: number): TeamMemberPersist {
  return {
    slot,
    speciesId: m?.species.id ?? null,
    speciesDisplay: m?.species.name ?? '',
    item: m?.item || null,
    ability: m?.ability || null,
    nature: m?.nature ?? null,
    level: m?.level ?? null,
    ivs: m ? { ...m.ivs } : null,
    evs: m ? { ...m.evs } : null,
    moves: m ? m.moves.filter((x) => x.trim()) : null,
  };
}

function toParsedMon(m: CalcMon): ParsedShowdownMon {
  return {
    species: m.species.name,
    item: m.item || undefined,
    ability: m.ability || undefined,
    nature: m.nature,
    level: m.level,
    evs: { ...m.evs },
    ivs: { ...m.ivs },
    moves: m.moves.filter((x) => x.trim()),
    rawSpeciesLine: m.species.name,
  };
}

const stageMult = (s: number) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

/** Display-only stat multipliers from common items (e.g. Choice Specs -> 640 SpA). */
function itemStatMult(item: string, k: StatKey): number {
  const it = item.trim().toLowerCase();
  if (k === 'atk' && it === 'choice band') return 1.5;
  if (k === 'spa' && it === 'choice specs') return 1.5;
  if (k === 'spe' && it === 'choice scarf') return 1.5;
  if (k === 'spd' && it === 'assault vest') return 1.5;
  return 1;
}

function koText(d: DamageOutcome): { text: string; color: string } {
  if (d.error) return { text: 'ERR', color: 'var(--ink-2)' };
  if (d.category === 'Status') return { text: 'N/A', color: 'var(--ink-2)' };
  if (d.isZero) return { text: 'IMMUNE', color: 'var(--ink-2)' };
  if (d.ko.n === 1 && d.ko.chance >= 1) return { text: '1HKO', color: 'var(--hud-danger)' };
  if (d.ko.n === 1) return { text: `${(d.ko.chance * 100).toFixed(0)}% 1HKO`, color: '#ffb84d' };
  if (d.ko.n === 2) {
    const pct = d.ko.chance >= 1 ? '' : ` ${(d.ko.chance * 100).toFixed(0)}%`;
    return { text: `2HKO${pct}`, color: '#ffd34d' };
  }
  if (d.ko.n > 0) return { text: `${d.ko.n}HKO`, color: 'var(--ink-1)' };
  return { text: '-', color: 'var(--ink-2)' };
}

function hpColorFor(pct: number): string {
  return pct > 50 ? '#7cd87b' : pct > 25 ? '#ffd34d' : 'var(--hud-danger)';
}

/** Strip the pill chrome off inputs that live inside tiles. */
const BARE_INPUT: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  padding: '2px 0',
};

/** Compact numeric input style (spinners hidden via .no-spin). */
const NUM_INPUT: React.CSSProperties = { padding: '2px 6px', fontSize: 13 };

export function CalcdexPage({
  pokemon,
  moves,
  items,
  smogon,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
  smogon: SmogonBundle | null;
}) {
  const bridge = typeof window !== 'undefined' ? window.assistant : undefined;
  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const intelBy = (id: string): SmogonSpeciesIntel | null => smogon?.species[id] ?? null;
  const fallbackMoves = (species: Pokemon) => suggestMoveset(species, moves).map((s) => s.move.name);

  /** Fresh mon for a species: usage build when intel exists, learnset fallback otherwise. */
  const freshMon = (species: Pokemon): CalcMon => {
    const base = blankMon(species, fallbackMoves(species));
    const intel = intelBy(species.id);
    return intel ? applyFill(base, usageFill(species, intel)) : base;
  };

  const monFromMember = (m: TeamMemberPersist): CalcMon | null => {
    const species = (m.speciesId && pokemonById[m.speciesId]) || resolveSpeciesName(fuse, m.speciesDisplay);
    if (!species) return null;
    const base = blankMon(species, fallbackMoves(species));
    return {
      ...base,
      level: m.level ?? 100,
      nature: m.nature ?? base.nature,
      ability: m.ability ? abilityName(m.ability) : base.ability,
      item: m.item ?? '',
      ivs: { ...NEUTRAL_IVS, ...(m.ivs ?? {}) },
      evs: { ...NEUTRAL_EVS, ...(m.evs ?? {}) },
      moves: m.moves?.length ? pad4(m.moves.map((x) => moveName(x, moves))) : base.moves,
      setLabel: 'custom',
    };
  };

  const monFromParsed = (block: ParsedShowdownMon): CalcMon | null => {
    const species = resolveSpeciesName(fuse, block.species);
    if (!species) return null;
    const base = blankMon(species, fallbackMoves(species));
    return {
      ...base,
      level: block.level ?? 100,
      nature: block.nature ?? base.nature,
      ability: block.ability ? abilityName(block.ability) : base.ability,
      item: block.item ?? '',
      ivs: { ...NEUTRAL_IVS, ...block.ivs },
      evs: { ...NEUTRAL_EVS, ...block.evs },
      moves: block.moves.length ? pad4(block.moves.map((x) => moveName(x, moves))) : base.moves,
      setLabel: 'custom',
    };
  };

  const [p1, setP1] = useState<PanelState>({ name: 'You', roster: [null, null, null, null, null, null], active: 0 });
  const [p2, setP2] = useState<PanelState>({ name: 'Opponent', roster: [null, null, null, null, null, null], active: 0 });

  const [weather, setWeather] = useState<Weather>('');
  const [terrain, setTerrain] = useState<Terrain>('');
  const [crit, setCrit] = useState(false);
  const [screens, setScreens] = useState<{ p1: Screens; p2: Screens }>({
    p1: { ...NO_SCREENS },
    p2: { ...NO_SCREENS },
  });

  const [savedTeams, setSavedTeams] = useState<{ id: string; name: string; tag: string }[]>([]);
  const refreshSaved = useMemo(
    () => async () => {
      if (!bridge?.teamsList) return;
      try {
        const rows = await bridge.teamsList();
        setSavedTeams(rows.map((r) => ({ id: r.id, name: r.name, tag: r.tag })));
      } catch {
        setSavedTeams([]);
      }
    },
    [bridge],
  );
  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const active1 = p1.roster[p1.active];
  const active2 = p2.roster[p2.active];

  const sideSpec = (s: Screens): SideSpec => ({ ...EMPTY_SIDE, ...s });

  const fieldFor = (attacker: SideKey): FieldSpec => ({
    weather,
    terrain,
    isGravity: false,
    attackerSide: sideSpec(attacker === 'p1' ? screens.p1 : screens.p2),
    defenderSide: sideSpec(attacker === 'p1' ? screens.p2 : screens.p1),
  });

  /** Damage per move slot (index-aligned; null for empty slots / no target). */
  const outcomesFor = (attacker: CalcMon | null, defender: CalcMon | null, side: SideKey) => {
    if (!attacker || !defender) return [null, null, null, null] as (DamageOutcome | null)[];
    const atkSpec = toBattleSpec(attacker);
    const defSpec = toBattleSpec(defender);
    const field = fieldFor(side);
    return attacker.moves.map((name) =>
      name.trim() ? calcDamage(9, atkSpec, defSpec, name, field, { isCrit: crit }) : null,
    ) as (DamageOutcome | null)[];
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outcomes1 = useMemo(() => outcomesFor(active1, active2, 'p1'), [active1, active2, weather, terrain, crit, screens]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outcomes2 = useMemo(() => outcomesFor(active2, active1, 'p2'), [active1, active2, weather, terrain, crit, screens]);

  const matchupLabel =
    active1 && active2 ? `${active1.species.name} vs ${active2.species.name}` : 'Set both actives to calc';

  const screenToggles: [keyof Screens, string][] = [
    ['isReflect', 'Reflect'],
    ['isLightScreen', 'Screen'],
    ['isAuroraVeil', 'Veil'],
  ];

  return (
    <ModuleFrame
      kicker="◢ CALCDEX"
      title="Damage Workbench"
      subtitle={`${matchupLabel}${weather ? ` · ${weather}` : ''}${terrain ? ` · ${terrain} Terrain` : ''}`}
      side={
        <button
          type="button"
          onClick={() => setCrit((v) => !v)}
          aria-pressed={crit}
          className="chunky font-display text-[12px]"
          style={
            {
              '--c': crit ? 'var(--hud-danger)' : 'var(--ink-2)',
              padding: '6px 14px',
            } as React.CSSProperties
          }
          title="Force every calc to assume a critical hit"
        >
          CRIT {crit ? 'ON' : 'OFF'}
        </button>
      }
    >
      <div className="flex flex-col gap-2.5 hud-form">
        <PlayerPanel
          side="p1"
          accent="var(--hud-accent-2)"
          panel={p1}
          setPanel={setP1}
          outcomes={outcomes1}
          opposing={active2}
          pokemon={pokemon}
          moves={moves}
          items={items}
          intelBy={intelBy}
          freshMon={freshMon}
          monFromMember={monFromMember}
          monFromParsed={monFromParsed}
          savedTeams={savedTeams}
          onSaved={refreshSaved}
        />

        {/* Global field controls between the two players */}
        <div className="mono-panel rounded-[10px] px-4 py-1.5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
          <label className="flex items-center gap-1.5 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
            Weather
            <select
              value={weather}
              onChange={(e) => setWeather(e.target.value as Weather)}
              style={{ padding: '2px 8px' }}
            >
              {WEATHERS.map((w) => (
                <option key={w.id || 'none'} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
            Terrain
            <select
              value={terrain}
              onChange={(e) => setTerrain(e.target.value as Terrain)}
              style={{ padding: '2px 8px' }}
            >
              {TERRAINS.map((t) => (
                <option key={t.id || 'none'} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <span className="w-px h-4 bg-white/10" />
          {(['p1', 'p2'] as SideKey[]).map((side) => (
            <div key={side} className="flex items-center gap-2 font-mono-hud text-[13px] text-[var(--ink-1)]">
              <span
                className="uppercase tracking-wider font-bold"
                style={{ color: side === 'p1' ? 'var(--hud-accent-2)' : 'var(--hud-danger)' }}
              >
                {(side === 'p1' ? p1.name : p2.name) || (side === 'p1' ? 'You' : 'Opponent')}
              </span>
              {screenToggles.map(([k, lbl]) => (
                <label key={k} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={screens[side][k]}
                    onChange={(e) => setScreens((s) => ({ ...s, [side]: { ...s[side], [k]: e.target.checked } }))}
                  />
                  {lbl}
                </label>
              ))}
            </div>
          ))}
        </div>

        <PlayerPanel
          side="p2"
          accent="var(--hud-danger)"
          panel={p2}
          setPanel={setP2}
          outcomes={outcomes2}
          opposing={active1}
          pokemon={pokemon}
          moves={moves}
          items={items}
          intelBy={intelBy}
          freshMon={freshMon}
          monFromMember={monFromMember}
          monFromParsed={monFromParsed}
          savedTeams={savedTeams}
          onSaved={refreshSaved}
        />
      </div>
    </ModuleFrame>
  );
}

function PlayerPanel({
  side,
  accent,
  panel,
  setPanel,
  outcomes,
  opposing,
  pokemon,
  moves,
  items,
  intelBy,
  freshMon,
  monFromMember,
  monFromParsed,
  savedTeams,
  onSaved,
}: {
  side: SideKey;
  accent: string;
  panel: PanelState;
  setPanel: React.Dispatch<React.SetStateAction<PanelState>>;
  outcomes: (DamageOutcome | null)[];
  opposing: CalcMon | null;
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
  intelBy: (id: string) => SmogonSpeciesIntel | null;
  freshMon: (species: Pokemon) => CalcMon;
  monFromMember: (m: TeamMemberPersist) => CalcMon | null;
  monFromParsed: (block: ParsedShowdownMon) => CalcMon | null;
  savedTeams: { id: string; name: string; tag: string }[];
  onSaved: () => Promise<void>;
}) {
  const bridge = typeof window !== 'undefined' ? window.assistant : undefined;
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const active = panel.roster[panel.active];
  const filled = panel.roster.filter((m): m is CalcMon => !!m);

  const setRosterSlot = (idx: number, mon: CalcMon | null) => {
    setPanel((p) => {
      const roster = [...p.roster];
      roster[idx] = mon;
      let nextActive = p.active;
      if (!mon && idx === p.active) {
        const firstFilled = roster.findIndex((m) => !!m);
        nextActive = firstFilled >= 0 ? firstFilled : 0;
      }
      return { ...p, roster, active: nextActive };
    });
  };

  const updateActive = (patch: Partial<CalcMon>, keepSet = false) => {
    setPanel((p) => {
      const roster = [...p.roster];
      const cur = roster[p.active];
      if (!cur) return p;
      // keepSet: the edit doesn't invalidate the loaded set (hp, boosts, tera…)
      // - but a patch that names a set (dropdown load) always wins.
      const setLabel = patch.setLabel ?? (keepSet ? cur.setLabel : 'custom');
      roster[p.active] = { ...cur, ...patch, setLabel };
      return { ...p, roster };
    });
  };

  const onImportPaste = () => {
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setMsg('No Pokémon blocks found in the paste.');
      return;
    }
    const roster: (CalcMon | null)[] = [null, null, null, null, null, null];
    const misses: string[] = [];
    parsed.slice(0, 6).forEach((block, i) => {
      const mon = monFromParsed(block);
      if (mon) roster[i] = mon;
      else misses.push(block.species);
    });
    setPanel((p) => ({ ...p, roster, active: 0 }));
    setImportOpen(false);
    setMsg(
      misses.length
        ? `Imported ${parsed.length - misses.length}/${parsed.length} - unmatched: ${misses.join(', ')}`
        : `Imported ${parsed.length} Pokémon.`,
    );
  };

  const onImportSaved = async (id: string) => {
    if (!bridge?.teamsLoad) return;
    const rec = await bridge.teamsLoad(id);
    if (!rec) return;
    const roster: (CalcMon | null)[] = [null, null, null, null, null, null];
    for (const m of rec.members) {
      if (m.slot < 0 || m.slot > 5 || !m.speciesDisplay) continue;
      roster[m.slot] = monFromMember(m);
    }
    setPanel((p) => ({ ...p, roster, active: Math.max(0, roster.findIndex((m) => !!m)) }));
    setImportOpen(false);
    setMsg(`Loaded “${rec.name}”.`);
  };

  const onImportDraft = () => {
    const draft = getTeamDraft();
    const roster: (CalcMon | null)[] = [null, null, null, null, null, null];
    let count = 0;
    draft.slice(0, 6).forEach((d, i) => {
      if (!d) return;
      const mon = monFromMember({
        slot: i,
        speciesId: d.speciesId,
        speciesDisplay: d.speciesId,
        item: d.detail?.item ?? null,
        ability: d.detail?.ability ?? null,
        nature: d.detail?.nature ?? null,
        level: d.detail?.level ?? null,
        ivs: d.detail?.ivs ?? null,
        evs: d.detail?.evs ?? null,
        moves: d.detail?.moves ?? null,
      });
      if (mon) {
        roster[i] = mon;
        count++;
      }
    });
    if (!count) {
      setMsg('Team Builder has no squad in progress.');
      return;
    }
    setPanel((p) => ({ ...p, roster, active: Math.max(0, roster.findIndex((m) => !!m)) }));
    setImportOpen(false);
    setMsg(`Loaded ${count} from the Team Builder.`);
  };

  const onExportTeam = async () => {
    if (!filled.length) return;
    const text = exportShowdownFromParsed(filled.map(toParsedMon), { includeLevelAlways: true });
    try {
      await navigator.clipboard.writeText(text);
      setMsg('Copied team as Showdown paste.');
    } catch {
      setMsg('Could not access the clipboard.');
    }
  };

  const onSaveTeam = async () => {
    if (!bridge?.teamsSave) {
      setMsg('Saving requires the desktop app (Electron).');
      return;
    }
    if (!filled.length) return;
    const payload: SaveTeamPayload = {
      name: panel.name.trim() || (side === 'p2' ? 'Scouted opponent' : 'Calcdex team'),
      tag: side === 'p2' ? 'opponent' : 'general',
      showdownExport: exportShowdownFromParsed(filled.map(toParsedMon), { includeLevelAlways: true }),
      members: panel.roster.map((m, slot) => toPersistMember(m, slot)),
    };
    try {
      await bridge.teamsSave(payload);
      await onSaved();
      setMsg(`Saved “${payload.name}”${side === 'p2' ? ' (opponent tag)' : ''}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    }
  };

  const pickSpecies = (species: Pokemon) => {
    if (pickingSlot === null) return;
    setRosterSlot(pickingSlot, freshMon(species));
    setPanel((p) => ({ ...p, active: pickingSlot }));
    setPickingSlot(null);
  };

  return (
    <div
      className="rounded-[14px] border bg-white/[.03] px-3 py-2.5"
      style={{ borderColor: 'rgba(255,255,255,.09)', boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      {/* Identity + roster top bar */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex flex-col w-[118px] flex-shrink-0 min-w-0">
          <span className="font-mono-hud text-[10px] uppercase tracking-[.2em] leading-none" style={{ color: accent }}>
            {side === 'p1' ? '◢ Your side' : '◢ Their side'}
          </span>
          <input
            value={panel.name}
            onChange={(e) => setPanel((p) => ({ ...p, name: e.target.value }))}
            aria-label={`${side === 'p1' ? 'Your' : "Opponent's"} name`}
            className="font-display text-[15px] font-bold text-white bg-transparent outline-none border-b border-transparent focus:border-white/25 transition w-full"
            style={BARE_INPUT}
          />
        </div>

        {/* Roster - every sprite clickable, active highlighted */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {panel.roster.map((mon, i) => {
            const isActive = mon && panel.active === i;
            return (
              <div key={i} className="relative group">
                <button
                  type="button"
                  onClick={() => {
                    if (mon) {
                      setPanel((p) => ({ ...p, active: i }));
                      setPickingSlot(null);
                    } else {
                      setPickingSlot(pickingSlot === i ? null : i);
                    }
                  }}
                  title={mon ? `${mon.species.name} - set active` : 'Add a Pokémon'}
                  className={`relative w-[46px] h-[46px] rounded-[10px] flex items-center justify-center transition ${
                    mon ? 'border' : 'border border-dashed'
                  }`}
                  style={{
                    borderColor: isActive || pickingSlot === i ? accent : 'rgba(255,255,255,.13)',
                    boxShadow: isActive ? `0 0 10px ${accent}44, inset 0 0 8px ${accent}22` : 'none',
                    background: mon ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.25)',
                    opacity: mon && mon.hpPercent <= 0 ? 0.35 : 1,
                  }}
                >
                  {mon ? (
                    <>
                      <PokemonSprite dex={mon.species.dex} name={mon.species.name} size="xs" />
                      <span className="absolute bottom-[3px] left-[6px] right-[6px] h-[2px] rounded-full bg-black/60 overflow-hidden">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${mon.hpPercent}%`, background: hpColorFor(mon.hpPercent) }}
                        />
                      </span>
                    </>
                  ) : (
                    <span className="font-mono-hud text-[16px] text-[var(--ink-2)] group-hover:text-[var(--ink-1)] transition">
                      ＋
                    </span>
                  )}
                </button>
                {mon && (
                  <button
                    type="button"
                    aria-label={`Remove ${mon.species.name}`}
                    onClick={() => setRosterSlot(i, null)}
                    className="absolute -top-1 -right-1 w-[15px] h-[15px] rounded-full bg-black/80 border border-white/20 text-[var(--ink-1)] hover:text-white font-mono-hud text-[10px] leading-none opacity-0 group-hover:opacity-100 transition"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {msg && (
          <span className="font-mono-hud text-[12px] text-[var(--ink-2)] min-w-0 flex-1 truncate" role="status">
            › {msg}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            className="chunky ghost font-display text-[11px]"
            style={{ padding: '3px 9px' }}
            onClick={() => setImportOpen((v) => !v)}
            aria-expanded={importOpen}
          >
            IMPORT
          </button>
          <button
            type="button"
            className="chunky ghost font-display text-[11px]"
            style={{ padding: '3px 9px' }}
            onClick={() => void onExportTeam()}
            disabled={!filled.length}
          >
            EXPORT
          </button>
          <button
            type="button"
            className="chunky font-display text-[11px]"
            style={{ '--c': accent, padding: '3px 9px' } as React.CSSProperties}
            onClick={() => void onSaveTeam()}
            disabled={!filled.length}
            title={side === 'p2' ? 'Save this opposing team for later (opponent tag)' : 'Save this team'}
          >
            SAVE TEAM
          </button>
        </div>
      </div>

      {/* Import drawer */}
      {importOpen && (
        <div className="mt-2 rounded-[10px] border border-white/10 bg-black/25 p-2.5 grid grid-cols-[200px,1fr] gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono-hud text-[11px] uppercase tracking-widest text-[var(--ink-2)]">
              Load a team
            </span>
            {savedTeams.length > 0 && (
              <select
                value=""
                aria-label="Load a saved team"
                onChange={(e) => {
                  if (e.target.value) void onImportSaved(e.target.value);
                }}
              >
                <option value="">Saved team…</option>
                {savedTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.tag === 'opponent' ? ' · opponent' : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="chunky ghost font-display text-[11px]"
              style={{ padding: '4px 10px' }}
              onClick={onImportDraft}
            >
              FROM TEAM BUILDER
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono-hud text-[11px] uppercase tracking-widest text-[var(--ink-2)]">
              Or paste a Showdown export
            </span>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={3}
              placeholder={'Garchomp @ Leftovers\nAbility: Rough Skin\n…'}
            />
            <button
              type="button"
              className="chunky font-display text-[11px] self-start"
              style={{ '--c': 'var(--hud-accent-2)', padding: '4px 10px' } as React.CSSProperties}
              onClick={onImportPaste}
              disabled={!paste.trim()}
            >
              IMPORT PASTE
            </button>
          </div>
        </div>
      )}

      {/* Species picker for an empty roster slot */}
      {pickingSlot !== null && (
        <div className="mt-2 rounded-[10px] border border-white/10 bg-black/25 p-2.5">
          <SectionHead label={`PICK SPECIES · SLOT ${pickingSlot + 1}`} extra="sets auto-fill from ladder usage" />
          <div className="h-[230px]">
            <SpeciesList pokemon={pokemon} onSelect={pickSpecies} />
          </div>
        </div>
      )}

      {/* Active dashboard */}
      {active ? (
        <ActiveDashboard
          side={side}
          mon={active}
          accent={accent}
          opposing={opposing}
          outcomes={outcomes}
          update={updateActive}
          moves={moves}
          items={items}
          intel={intelBy(active.species.id)}
          onCopySet={async () => {
            const text = exportShowdownFromParsed([toParsedMon(active)], { includeLevelAlways: true });
            try {
              await navigator.clipboard.writeText(text);
              setMsg(`Copied ${active.species.name} set.`);
            } catch {
              setMsg('Could not access the clipboard.');
            }
          }}
        />
      ) : (
        <div className="font-mono-hud text-[14px] text-[var(--ink-2)] text-center py-6">
          {filled.length
            ? 'Click a roster sprite to open its dashboard.'
            : 'Empty roster - click a ＋ slot, import a saved team, or paste a Showdown export.'}
        </div>
      )}
    </div>
  );
}

function ActiveDashboard({
  side,
  mon,
  accent,
  opposing,
  outcomes,
  update,
  moves,
  items,
  intel,
  onCopySet,
}: {
  side: SideKey;
  mon: CalcMon;
  accent: string;
  opposing: CalcMon | null;
  outcomes: (DamageOutcome | null)[];
  update: (patch: Partial<CalcMon>, keepSet?: boolean) => void;
  moves: Record<string, Move>;
  items: HeldItem[];
  intel: SmogonSpeciesIntel | null;
  onCopySet: () => Promise<void>;
}) {
  const [showSpread, setShowSpread] = useState(false);

  const learnset = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lm of mon.species.moves) {
      const mv = moves[lm.move];
      if (mv && !seen.has(mv.id)) {
        seen.add(mv.id);
        out.push(mv.name);
      }
    }
    return sortMovesByUsage(out, intel);
  }, [mon.species, moves, intel]);

  const sets = useMemo(() => allSetFills(mon.species, intel), [mon.species, intel]);
  const abilities = useMemo(() => {
    const all = [...mon.species.abilities, ...mon.species.hiddenAbilities].map(abilityName);
    if (mon.ability && !all.includes(mon.ability)) all.push(mon.ability);
    return [...new Set(all)];
  }, [mon.species, mon.ability]);

  const finalStats = useMemo(
    () => calcAllStats(mon.species.baseStats, mon.ivs, mon.evs, mon.level, mon.nature),
    [mon],
  );

  const nature = NATURES[mon.nature] || {};
  const datalistId = `calcdex-moves-${side}-${mon.species.id}`;
  const t1 = mon.species.types[0].toLowerCase();

  const setMove = (i: number, name: string) => {
    const next = [...mon.moves] as CalcMon['moves'];
    next[i] = name;
    update({ moves: next });
  };
  const setStat = (which: 'evs' | 'ivs', k: StatKey, v: number) => {
    const max = which === 'evs' ? 252 : 31;
    const clamped = Math.max(0, Math.min(max, Number.isFinite(v) ? Math.round(v) : 0));
    update({ [which]: { ...mon[which], [k]: clamped } } as Partial<CalcMon>);
  };
  const bumpStage = (k: StatKey, delta: number) => {
    const cur = mon.boosts[k] ?? 0;
    const next = Math.max(-6, Math.min(6, cur + delta));
    update({ boosts: { ...mon.boosts, [k]: next } }, true);
  };

  const hpColor = hpColorFor(mon.hpPercent);
  const evTotal = STAT_KEYS.reduce((sum, k) => sum + mon.evs[k], 0);

  return (
    <div className="mt-2.5 flex flex-col gap-2 min-w-0">
      <div className="grid grid-cols-[195px,215px,minmax(0,1fr)] gap-2.5 items-stretch">
        {/* Identity card - type-tinted like the Team Builder squad cards */}
        <div className="relative overflow-hidden rounded-[10px] border border-white/10">
          <div
            className="absolute inset-0 opacity-[.10] pointer-events-none"
            style={{ background: `linear-gradient(160deg, var(--t-${t1}) 0%, transparent 70%)` }}
          />
          <div className="relative p-2 flex flex-col gap-1.5 h-full">
            <div className="flex items-center gap-1.5 min-w-0">
              <PokemonSprite dex={mon.species.dex} name={mon.species.name} size="xs" />
              <span className="font-display text-[15px] font-bold leading-tight text-[var(--ink-0)] truncate flex-1 min-w-0">
                {mon.species.name}
              </span>
              <label
                className="flex items-center gap-1 font-mono-hud text-[10px] uppercase text-[var(--ink-2)] flex-shrink-0"
                title="Level"
              >
                LV
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={mon.level}
                  onChange={(e) => update({ level: Math.max(1, Math.min(100, Number(e.target.value) || 1)) }, true)}
                  className="no-spin w-[38px] text-center"
                  style={NUM_INPUT}
                />
              </label>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {mon.species.types.map((t) => (
                <TypeChip key={t} t={t.toLowerCase()} />
              ))}
              {mon.teraType && (
                <span
                  className={`font-mono-hud text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                    mon.isTera ? 'text-black' : 'text-[var(--ink-1)]'
                  }`}
                  style={{
                    borderColor: `var(--t-${mon.teraType.toLowerCase()})`,
                    background: mon.isTera ? `var(--t-${mon.teraType.toLowerCase()})` : 'transparent',
                  }}
                  title={mon.isTera ? 'Terastallized' : 'Tera type (not active)'}
                >
                  ⬡ {mon.teraType}
                </span>
              )}
            </div>
            <div className="relative h-[10px] rounded-full bg-black/50 overflow-hidden border border-white/10 mt-auto">
              <div
                className="absolute inset-y-0 left-0 transition-all rounded-full"
                style={{ width: `${mon.hpPercent}%`, background: hpColor, boxShadow: `0 0 6px ${hpColor}` }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={mon.hpPercent}
                aria-label="Current HP percent"
                onChange={(e) => update({ hpPercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }, true)}
                className="no-spin w-[46px] text-center"
                style={NUM_INPUT}
              />
              <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">% HP</span>
              <select
                value={mon.status}
                aria-label="Status condition"
                onChange={(e) => update({ status: e.target.value as StatusCode }, true)}
                className="flex-1 min-w-0"
                style={{ padding: '2px 8px' }}
              >
                {STATUSES.map((s) => (
                  <option key={s.id || 'ok'} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Config column: set, ability, nature, item, tera */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <select
              value={sets.some((s) => s.label === mon.setLabel) ? mon.setLabel : 'custom'}
              aria-label="Load a set"
              title="Load a set - Showdown usage or curated builds"
              onChange={(e) => {
                const fill = sets.find((s) => s.label === e.target.value);
                if (fill) update(applyFill(mon, fill), true);
              }}
              className="flex-1 min-w-0"
              disabled={!sets.length}
            >
              <option value="custom">{sets.length ? 'Custom set' : 'No usage data'}</option>
              {sets.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="chunky ghost font-display text-[10px] flex-shrink-0"
              style={{ padding: '3px 8px' }}
              onClick={() => void onCopySet()}
              title="Copy this set as a Showdown paste block"
            >
              COPY
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <select
              value={mon.ability}
              aria-label="Ability"
              title="Ability"
              onChange={(e) => update({ ability: e.target.value })}
              className="min-w-0"
            >
              <option value="">Ability -</option>
              {abilities.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={mon.nature}
              aria-label="Nature"
              title="Nature"
              onChange={(e) => update({ nature: e.target.value })}
              className="min-w-0"
            >
              {Object.keys(NATURES).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <ItemSearchInput
              value={mon.item}
              onChange={(v) => update({ item: v })}
              items={items}
              placeholder="Item - none"
            />
            {mon.item && (
              <button
                type="button"
                aria-label="Remove item"
                title="Remove item (e.g. after Knock Off)"
                onClick={() => update({ item: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-[16px] h-[16px] rounded-full bg-black/60 border border-white/20 text-[var(--ink-2)] hover:text-[var(--hud-danger)] font-mono-hud text-[10px] leading-none transition"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={mon.teraType}
              aria-label="Tera type"
              title="Tera type"
              onChange={(e) => update({ teraType: e.target.value }, true)}
              className="flex-1 min-w-0"
            >
              <option value="">Tera type -</option>
              {ALL_TERA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={mon.isTera}
              disabled={!mon.teraType}
              onClick={() => update({ isTera: !mon.isTera }, true)}
              className="font-mono-hud text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border transition flex-shrink-0 disabled:opacity-40"
              style={{
                borderColor: mon.isTera ? `var(--t-${(mon.teraType || 'normal').toLowerCase()})` : 'rgba(255,255,255,.18)',
                background: mon.isTera ? `var(--t-${(mon.teraType || 'normal').toLowerCase()})` : 'transparent',
                color: mon.isTera ? '#0b0b0b' : 'var(--ink-1)',
              }}
            >
              TERA
            </button>
          </div>
        </div>

        {/* Move matrix */}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline justify-between px-0.5">
            <span className="font-mono-hud text-[11px] uppercase tracking-widest" style={{ color: accent }}>
              ◢ Moves
            </span>
            <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] truncate">
              {opposing ? `vs ${opposing.species.name} · ${opposing.hpPercent}% HP` : 'no target - add an opposing active'}
            </span>
          </div>
          {[0, 1, 2, 3].map((i) => {
            const name = mon.moves[i];
            const d = outcomes[i];
            const mv = findMove(name, moves);
            const ko = d ? koText(d) : null;
            const showBar = d && !d.isZero && !d.error;
            const barPct = d ? Math.min(100, d.pctMax) : 0;
            const ohko = d && !d.isZero && d.ko.n === 1 && d.ko.chance >= 1;
            return (
              <div
                key={i}
                className={`grid grid-cols-[minmax(0,1.05fr),minmax(70px,1fr),96px,16px] gap-2 items-center rounded-[8px] pl-2.5 pr-1.5 py-[3px] border transition ${
                  name ? 'border-white/10 bg-white/[.04]' : 'border-dashed border-white/10 bg-transparent'
                }`}
                title={d?.desc || undefined}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <input
                    list={datalistId}
                    value={name}
                    onChange={(e) => setMove(i, e.target.value)}
                    placeholder="＋ add move"
                    aria-label={`Move ${i + 1}`}
                    className="min-w-0 flex-1 font-display font-semibold"
                    style={{ ...BARE_INPUT, fontSize: 14 }}
                  />
                  {mv && <TypeChip t={mv.type.toLowerCase()} />}
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="relative flex-1 h-[8px] rounded-full bg-black/40 overflow-hidden">
                    {showBar && (
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${barPct}%`,
                          background: ohko
                            ? 'linear-gradient(90deg,#ff5b6c,#ffb84d)'
                            : `linear-gradient(90deg,${accent},var(--hud-accent-2))`,
                        }}
                      />
                    )}
                  </div>
                </div>
                <span
                  className="font-mono-hud text-[12px] tabular-nums whitespace-nowrap text-right"
                  style={{ color: showBar ? '#fff' : 'var(--ink-2)' }}
                >
                  {d
                    ? d.error
                      ? 'calc error'
                      : d.isZero
                        ? d.category === 'Status'
                          ? '-'
                          : ko?.text === 'IMMUNE'
                            ? 'immune'
                            : '0%'
                        : `${d.pctMin.toFixed(1)}–${d.pctMax.toFixed(1)}%`
                    : name
                      ? '-'
                      : ''}
                  {d && !d.isZero && !d.error && ko && (
                    <span className="ml-1.5" style={{ color: ko.color }}>
                      {ko.text}
                    </span>
                  )}
                </span>
                {name ? (
                  <button
                    type="button"
                    aria-label={`Clear move ${i + 1}`}
                    onClick={() => setMove(i, '')}
                    className="w-4 h-4 rounded-full bg-black/50 border border-white/15 text-[var(--ink-2)] hover:text-white font-mono-hud text-[10px] leading-none"
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
          <datalist id={datalistId}>
            {learnset.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Deep stat strip - horizontal, expandable IV/EV rows */}
      <div className="rounded-[10px] border border-white/10 bg-black/20 px-3 py-1.5">
        <div className="grid grid-cols-[repeat(6,minmax(0,1fr)),auto] gap-x-2 gap-y-1 items-center">
          {STAT_KEYS.map((k) => {
            const base = finalStats[k];
            const stage = k === 'hp' ? 0 : (mon.boosts[k] ?? 0);
            const modified = k === 'hp' ? base : Math.floor(base * stageMult(stage) * itemStatMult(mon.item, k));
            const isModified = modified !== base;
            const labelColor =
              nature.plus === k ? 'var(--hud-danger)' : nature.minus === k ? '#5ea7ff' : 'var(--ink-2)';
            const v = mon.boosts[k] ?? 0;
            return (
              <div key={k} className="flex items-center justify-center gap-2">
                <div className="flex flex-col items-center leading-tight">
                  <span className="font-mono-hud text-[10px] uppercase tracking-wider" style={{ color: labelColor }}>
                    {STAT_LABELS[k]}
                    {nature.plus === k ? '+' : nature.minus === k ? '−' : ''}
                  </span>
                  <span
                    className="font-display text-[15px] font-bold tabular-nums"
                    style={{ color: isModified ? 'var(--hud-accent)' : 'var(--ink-0)' }}
                    title={
                      isModified
                        ? `${base} base${stage ? ` · stage ${stage > 0 ? '+' : ''}${stage}` : ''}${
                            itemStatMult(mon.item, k) !== 1 ? ` · ${mon.item}` : ''
                          }`
                        : undefined
                    }
                  >
                    {modified}
                  </span>
                </div>
                {BOOSTABLE.includes(k) && (
                  <div className="flex flex-col items-center gap-[2px]">
                    <button
                      type="button"
                      aria-label={`Raise ${STAT_LABELS[k]} stage`}
                      onClick={() => bumpStage(k, 1)}
                      className="w-[16px] h-[13px] rounded-[4px] border border-white/15 text-[var(--ink-2)] hover:text-white hover:border-white/35 font-mono-hud text-[10px] leading-none transition"
                    >
                      +
                    </button>
                    <span
                      className="font-mono-hud text-[10px] tabular-nums leading-none cursor-pointer"
                      style={{ color: v > 0 ? 'var(--hud-danger)' : v < 0 ? '#5ea7ff' : 'var(--ink-2)' }}
                      title="Stage - click to reset"
                      onClick={() => update({ boosts: { ...mon.boosts, [k]: 0 } }, true)}
                    >
                      {v > 0 ? `+${v}` : v}
                    </span>
                    <button
                      type="button"
                      aria-label={`Lower ${STAT_LABELS[k]} stage`}
                      onClick={() => bumpStage(k, -1)}
                      className="w-[16px] h-[13px] rounded-[4px] border border-white/15 text-[var(--ink-2)] hover:text-white hover:border-white/35 font-mono-hud text-[10px] leading-none transition"
                    >
                      −
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-1)] hover:text-white transition whitespace-nowrap justify-self-end"
            onClick={() => setShowSpread((v) => !v)}
          >
            {showSpread ? '▾' : '▸'} IV / EV
          </button>

          {showSpread && (
            <>
              {STAT_KEYS.map((k) => (
                <input
                  key={`iv-${k}`}
                  type="number"
                  min={0}
                  max={31}
                  aria-label={`${STAT_LABELS[k]} IVs`}
                  value={mon.ivs[k]}
                  onChange={(e) => setStat('ivs', k, Number(e.target.value))}
                  className="no-spin text-center w-full max-w-[72px] justify-self-center"
                  style={NUM_INPUT}
                />
              ))}
              <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] justify-self-end">
                IV
              </span>
              {STAT_KEYS.map((k) => (
                <input
                  key={`ev-${k}`}
                  type="number"
                  min={0}
                  max={252}
                  step={4}
                  aria-label={`${STAT_LABELS[k]} EVs`}
                  value={mon.evs[k]}
                  onChange={(e) => setStat('evs', k, Number(e.target.value))}
                  className="no-spin text-center w-full max-w-[72px] justify-self-center"
                  style={NUM_INPUT}
                />
              ))}
              <span
                className="font-mono-hud text-[11px] uppercase tracking-wider justify-self-end whitespace-nowrap"
                style={{ color: evTotal > 510 ? 'var(--hud-danger)' : 'var(--ink-2)' }}
              >
                EV {evTotal}/510
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
