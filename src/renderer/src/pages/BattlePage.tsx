import { useMemo, useState } from 'react';
import type { BaseStats, Move, Pokemon, StatKey } from '../lib/types';
import {
  EMPTY_FIELD,
  NEUTRAL_EVS,
  NEUTRAL_IVS,
  type FieldSpec,
  type BattlePokemonSpec,
  type Weather,
  type Terrain,
} from '../lib/battle/types';
import { calcAllMoves, type DamageOutcome } from '../lib/battle/damage';
import { parseShowdownTeam, type ParsedShowdownMon } from '../lib/showdownTeam';
import { buildSpeciesFuse, resolveSpeciesName } from '../lib/fuzzySpecies';
import { NATURES } from '../lib/stats';
import { TYPES } from '../lib/typechart';
import { TypeBadge } from '../components/TypeBadge';
import { ItemSearchInput } from '../components/ItemSearchInput';
import type { HeldItem } from '../lib/types';
import { PokemonSprite } from '../components/PokemonSprite';
import { suggestMoveset } from '../lib/recommender';
import { dexForSpeciesName } from '../lib/pokemonSprite';

type StatusCode = '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

interface CombatSpec {
  speciesName: string; // display name, e.g. "Garchomp"
  level: number;
  nature: string;
  ability: string;
  item: string;
  teraType: string; // capitalized, e.g. "Steel"
  isTera: boolean;
  ivs: BaseStats;
  evs: BaseStats;
  moves: [string, string, string, string];
  currentHPPercent: number;
  status: StatusCode;
  boosts: Partial<Record<StatKey, number>>;
}

const ALL_TERA_TYPES = ['', ...TYPES.map((t) => t[0].toUpperCase() + t.slice(1))];
const STATUSES: { id: StatusCode; label: string }[] = [
  { id: '', label: 'Healthy' },
  { id: 'brn', label: 'Burn' },
  { id: 'par', label: 'Paralyzed' },
  { id: 'psn', label: 'Poisoned' },
  { id: 'tox', label: 'Badly Poisoned' },
  { id: 'slp', label: 'Asleep' },
  { id: 'frz', label: 'Frozen' },
];

const WEATHERS: { id: Weather; label: string }[] = [
  { id: '', label: 'None' },
  { id: 'Sun', label: 'Sun' },
  { id: 'Rain', label: 'Rain' },
  { id: 'Sand', label: 'Sandstorm' },
  { id: 'Snow', label: 'Snow' },
  { id: 'Hail', label: 'Hail' },
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

const BOOST_KEYS: StatKey[] = ['atk', 'def', 'spa', 'spd', 'spe'];

function emptySpec(speciesName = ''): CombatSpec {
  return {
    speciesName,
    level: 50,
    nature: 'Hardy',
    ability: '',
    item: '',
    teraType: '',
    isTera: false,
    ivs: { ...NEUTRAL_IVS },
    evs: { ...NEUTRAL_EVS },
    moves: ['', '', '', ''],
    currentHPPercent: 100,
    status: '',
    boosts: {},
  };
}

function toBattleSpec(c: CombatSpec): BattlePokemonSpec {
  return {
    speciesName: c.speciesName,
    level: c.level,
    nature: c.nature,
    ability: c.ability || undefined,
    item: c.item || undefined,
    teraType: c.teraType || undefined,
    isTerastallized: c.isTera && !!c.teraType,
    ivs: c.ivs,
    evs: c.evs,
    moves: c.moves.filter((m) => m.trim().length > 0).map((name) => ({ name })),
    currentHPPercent: c.currentHPPercent,
    status: c.status || undefined,
    boosts: c.boosts,
  };
}

function specFromParsed(
  block: ParsedShowdownMon,
  resolvedName: string,
  fallbackMoves: string[],
): CombatSpec {
  const base = emptySpec(resolvedName);
  base.level = block.level ?? 50;
  if (block.nature) base.nature = block.nature;
  if (block.ability) base.ability = block.ability;
  if (block.item) base.item = block.item;
  base.evs = { ...NEUTRAL_EVS, ...(block.evs as Partial<BaseStats>) };
  base.ivs = { ...NEUTRAL_IVS, ...(block.ivs as Partial<BaseStats>) };
  const moves = block.moves.slice(0, 4);
  while (moves.length < 4) moves.push(fallbackMoves[moves.length] ?? '');
  base.moves = [moves[0] ?? '', moves[1] ?? '', moves[2] ?? '', moves[3] ?? ''];
  return base;
}

function nHKOText(d: DamageOutcome): string {
  if (d.error) return 'err';
  if (d.isZero) return '-';
  if (d.ko.text) return d.ko.text;
  if (d.ko.chance >= 1) return `${d.ko.n}HKO`;
  return `${d.ko.n}HKO ${(d.ko.chance * 100).toFixed(0)}%`;
}

function rangeText(d: DamageOutcome): string {
  if (d.error) return d.error;
  if (d.isZero) return '0 damage';
  return `${d.pctMin.toFixed(1)}–${d.pctMax.toFixed(1)}%`;
}

function damageColor(d: DamageOutcome): string {
  if (d.error || d.isZero) return 'var(--fg-dim)';
  if (d.ko.chance >= 1 && d.ko.n === 1) return 'var(--danger)';
  if (d.ko.n === 1) return 'var(--warn)';
  if (d.pctMax >= 50) return 'var(--accent)';
  return 'var(--fg)';
}

export function BattlePage({
  pokemon,
  moves,
  items,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
}) {
  const pokemonByName = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.name.toLowerCase()] = p;
    return m;
  }, [pokemon]);

  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);

  const [paste, setPaste] = useState('');
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const [team, setTeam] = useState<(CombatSpec | null)[]>([null, null, null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);

  const [opponent, setOpponent] = useState<CombatSpec>(emptySpec());
  const [field, setField] = useState<FieldSpec>(EMPTY_FIELD);

  const setSlot = (idx: number, c: CombatSpec | null) => {
    const next = [...team];
    next[idx] = c;
    setTeam(next);
  };

  // Live damage rows for every team member's moves vs the opponent.
  const opponentSpec = useMemo(() => toBattleSpec(opponent), [opponent]);
  const teamSpecs = useMemo(() => team.map((c) => (c ? toBattleSpec(c) : null)), [team]);

  const opponentReady = opponent.speciesName.trim().length > 0;

  const teamDamage = useMemo(() => {
    if (!opponentReady) return [];
    return teamSpecs.map((s, i) => {
      if (!s) return { idx: i, outcomes: [] as DamageOutcome[] };
      const outcomes = calcAllMoves(9, s, opponentSpec, field);
      return { idx: i, outcomes };
    });
  }, [teamSpecs, opponentSpec, opponentReady, field]);

  const activeSpec = teamSpecs[activeSlot];
  const reverseFieldSwap: FieldSpec = useMemo(
    () => ({
      ...field,
      attackerSide: field.defenderSide,
      defenderSide: field.attackerSide,
    }),
    [field],
  );
  const reverseDamage = useMemo(() => {
    if (!opponentReady || !activeSpec) return [] as DamageOutcome[];
    return calcAllMoves(9, opponentSpec, activeSpec, reverseFieldSwap);
  }, [opponentSpec, activeSpec, reverseFieldSwap, opponentReady]);

  const onImportPaste = () => {
    setParseMsg(null);
    const parsed = parseShowdownTeam(paste);
    if (!parsed.length) {
      setParseMsg('No Pokémon blocks found. Paste a Showdown export (blank line between species).');
      return;
    }
    const next: (CombatSpec | null)[] = [null, null, null, null, null, null];
    const misses: string[] = [];
    parsed.forEach((block, i) => {
      if (i >= 6) return;
      const species = resolveSpeciesName(fuse, block.species);
      if (!species) {
        misses.push(block.species);
        return;
      }
      const fallback = suggestMoveset(species, moves).map((s) => s.move.name);
      next[i] = specFromParsed(block, species.name, fallback);
    });
    setTeam(next);
    if (misses.length) {
      setParseMsg(`Loaded ${parsed.length - misses.length}/${parsed.length}. Unmatched: ${misses.join(', ')}`);
    } else {
      setParseMsg(`Imported ${parsed.length} Pokémon.`);
    }
  };

  const fillSlotFromSpecies = (idx: number, name: string) => {
    const species = pokemonByName[name.toLowerCase()];
    if (!species) return;
    const spec = emptySpec(species.name);
    const learnset = suggestMoveset(species, moves);
    spec.moves = [0, 1, 2, 3].map(
      (i) => learnset[i]?.move?.name ?? '',
    ) as CombatSpec['moves'];
    spec.ability = species.abilities[0] ?? '';
    setSlot(idx, spec);
  };

  return (
    <div>
      <h1 className="page-title">Battle Assistant</h1>
      <p className="page-sub">
        Enter the current opponent and field, then see live damage for every move on every member of your team,
        using <code>@smogon/calc</code> over Cobblemon-aware data.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <CombatPanel
          title="Opponent"
          spec={opponent}
          onChange={setOpponent}
          pokemonByName={pokemonByName}
          pokemon={pokemon}
          moves={moves}
          items={items}
        />
        <FieldPanel field={field} onChange={setField} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="section-head">Your team</div>
        <p style={{ fontSize: 12, color: 'var(--fg-dim)', marginTop: 0 }}>
          Paste a Showdown export or click a slot to drop a species in with a suggested moveset. Each slot's moves are
          calc'd against the opponent below.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder={
            'Paste a Showdown export…\n\nGarchomp @ Choice Band\nAbility: Rough Skin\nEVs: 4 HP / 252 Atk / 252 Spe\nJolly Nature\n- Earthquake\n- Outrage\n- Stone Edge\n- Iron Head'
          }
          rows={6}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={onImportPaste}>
            Import paste
          </button>
          <button type="button" onClick={() => setTeam([null, null, null, null, null, null])}>
            Clear team
          </button>
          {parseMsg && <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{parseMsg}</span>}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
            marginTop: 12,
          }}
        >
          {team.map((slot, i) => (
            <SlotChip
              key={i}
              idx={i}
              slot={slot}
              active={activeSlot === i}
              pokemon={pokemon}
              onActivate={() => setActiveSlot(i)}
              onPick={(name) => fillSlotFromSpecies(i, name)}
              onClear={() => setSlot(i, null)}
            />
          ))}
        </div>
      </div>

      {!opponentReady && (
        <div className="panel" style={{ marginBottom: 16, color: 'var(--fg-dim)' }}>
          Pick an opponent species above to see damage calculations.
        </div>
      )}

      {opponentReady && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="section-head">
            Your moves vs {opponent.speciesName || 'opponent'} ({opponent.currentHPPercent}% HP)
          </div>
          {team.every((s) => !s) && (
            <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>Add at least one team member to see damage rows.</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {teamDamage.map(({ idx, outcomes }) => {
              const slot = team[idx];
              if (!slot) return null;
              const sorted = [...outcomes]
                .map((o, i) => ({ o, i }))
                .sort((a, b) => {
                  const ka = a.o.ko.chance + a.o.pctMax / 1000;
                  const kb = b.o.ko.chance + b.o.pctMax / 1000;
                  return kb - ka;
                });
              return (
                <div key={idx} className={`team-slot ${activeSlot === idx ? '' : ''}`} style={{ padding: 12, background: 'var(--bg-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <strong>{slot.speciesName}</strong>
                    <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>
                      L{slot.level} {slot.nature}
                      {slot.item ? ` · ${slot.item}` : ''}
                      {slot.ability ? ` · ${slot.ability}` : ''}
                    </span>
                    <button
                      type="button"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => setActiveSlot(idx)}
                      className={activeSlot === idx ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    >
                      {activeSlot === idx ? 'Active' : 'Make active'}
                    </button>
                  </div>
                  {outcomes.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--fg-dim)' }}>No moves configured.</div>
                  ) : (
                    <div>
                      {sorted.map(({ o, i }) => (
                        <DamageRow key={`${o.moveName}-${i}`} d={o} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {opponentReady && activeSpec && team[activeSlot] && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="section-head">
            {opponent.speciesName || 'Opponent'} → {team[activeSlot]?.speciesName} ({team[activeSlot]?.currentHPPercent}% HP)
          </div>
          {reverseDamage.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--fg-dim)' }}>
              Add moves to the opponent above to see what they might hit you with.
            </p>
          ) : (
            <div>
              {reverseDamage.map((o, i) => (
                <DamageRow key={`${o.moveName}-${i}`} d={o} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DamageRow({ d }: { d: DamageOutcome }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 60px 90px 100px 110px 1fr',
        gap: 8,
        alignItems: 'center',
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600 }}>{d.moveName}</span>
      <span style={{ color: 'var(--fg-dim)' }}>{d.category[0]}</span>
      <span style={{ color: 'var(--fg-dim)' }}>BP {d.basePower || '-'}</span>
      <span style={{ color: damageColor(d), fontWeight: 600 }}>{rangeText(d)}</span>
      <span style={{ color: damageColor(d) }}>{nHKOText(d)}</span>
      <span style={{ color: 'var(--fg-dim)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {d.desc}
      </span>
    </div>
  );
}

function SlotChip({
  idx,
  slot,
  active,
  pokemon,
  onActivate,
  onPick,
  onClear,
}: {
  idx: number;
  slot: CombatSpec | null;
  active: boolean;
  pokemon: Pokemon[];
  onActivate: () => void;
  onPick: (name: string) => void;
  onClear: () => void;
}) {
  const [text, setText] = useState('');
  const datalistId = `species-slot-${idx}`;
  return (
    <div
      className="team-slot"
      style={{
        borderColor: active ? 'var(--accent)' : undefined,
        background: active ? 'rgba(56,189,248,0.08)' : undefined,
      }}
      onClick={onActivate}
    >
      {slot ? (
        <>
          {(() => {
            const dex = dexForSpeciesName(pokemon, slot.speciesName);
            return dex ? <PokemonSprite dex={dex} name={slot.speciesName} size="xs" /> : null;
          })()}
          <strong style={{ fontSize: 13 }}>{slot.speciesName}</strong>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
            L{slot.level} · {slot.nature}
          </div>
          <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
            {slot.moves.filter(Boolean).join(', ') || 'no moves'}
          </div>
          <button
            type="button"
            style={{ position: 'absolute', top: 4, right: 4, padding: '2px 6px', fontSize: 10 }}
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            aria-label={`Clear slot ${idx + 1}`}
          >
            ×
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 11 }}>slot {idx + 1}</span>
          <input
            list={datalistId}
            placeholder="Species…"
            value={text}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                onPick(text.trim());
                setText('');
              }
            }}
            onBlur={() => {
              if (text.trim()) {
                onPick(text.trim());
                setText('');
              }
            }}
            style={{ fontSize: 11, padding: '3px 6px' }}
          />
          <datalist id={datalistId}>
            {pokemon.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}

function CombatPanel({
  title,
  spec,
  onChange,
  pokemonByName,
  pokemon,
  moves,
  items,
}: {
  title: string;
  spec: CombatSpec;
  onChange: (next: CombatSpec) => void;
  pokemonByName: Record<string, Pokemon>;
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  items: HeldItem[];
}) {
  const species = pokemonByName[spec.speciesName.toLowerCase()];
  const learnsetNames = useMemo(() => {
    if (!species) return [] as string[];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lm of species.moves) {
      const mv = moves[lm.move];
      if (mv && !seen.has(mv.id)) {
        seen.add(mv.id);
        out.push(mv.name);
      }
    }
    return out;
  }, [species, moves]);

  const update = <K extends keyof CombatSpec>(k: K, v: CombatSpec[K]) => onChange({ ...spec, [k]: v });
  const setMove = (i: number, name: string) => {
    const next = [...spec.moves] as CombatSpec['moves'];
    next[i] = name;
    onChange({ ...spec, moves: next });
  };
  const setEv = (k: StatKey, v: number) => {
    const clamped = Math.max(0, Math.min(252, Number.isFinite(v) ? v : 0));
    onChange({ ...spec, evs: { ...spec.evs, [k]: clamped } });
  };
  const setBoost = (k: StatKey, v: number) => {
    const clamped = Math.max(-6, Math.min(6, Number.isFinite(v) ? v : 0));
    onChange({ ...spec, boosts: { ...spec.boosts, [k]: clamped } });
  };

  return (
    <div className="panel">
      <div className="section-head">{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Species</span>
          <input
            list={`species-${title}`}
            value={spec.speciesName}
            onChange={(e) => {
              const v = e.target.value;
              const hit = pokemonByName[v.toLowerCase()];
              onChange({ ...spec, speciesName: hit ? hit.name : v });
            }}
            placeholder="e.g. Garchomp"
          />
          <datalist id={`species-${title}`}>
            {pokemon.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Level</span>
          <input
            type="number"
            min={1}
            max={100}
            value={spec.level}
            onChange={(e) => update('level', Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Ability</span>
          <input
            list={`abil-${title}`}
            value={spec.ability}
            onChange={(e) => update('ability', e.target.value)}
            placeholder={species?.abilities[0] || ''}
          />
          {species && (
            <datalist id={`abil-${title}`}>
              {[...species.abilities, ...species.hiddenAbilities].map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          )}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Held item</span>
          <ItemSearchInput value={spec.item} onChange={(v) => update('item', v)} items={items} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Nature</span>
          <select value={spec.nature} onChange={(e) => update('nature', e.target.value)}>
            {Object.keys(NATURES).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Status</span>
          <select value={spec.status} onChange={(e) => update('status', e.target.value as StatusCode)}>
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>HP %</span>
          <input
            type="number"
            min={1}
            max={100}
            value={spec.currentHPPercent}
            onChange={(e) => update('currentHPPercent', Math.max(1, Math.min(100, Number(e.target.value) || 100)))}
          />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Tera</span>
          <select value={spec.teraType} onChange={(e) => update('teraType', e.target.value)}>
            {ALL_TERA_TYPES.map((t) => (
              <option key={t || 'none'} value={t}>
                {t || '-'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginTop: 14 }}>
          <input
            type="checkbox"
            checked={spec.isTera}
            onChange={(e) => update('isTera', e.target.checked)}
            disabled={!spec.teraType}
          />
          Terastallized
        </label>
        <div />
      </div>

      <div className="section-head">EVs</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 6 }}>
        {(['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatKey[]).map((k) => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase' }}>{k}</span>
            <input
              type="number"
              min={0}
              max={252}
              step={4}
              value={spec.evs[k]}
              onChange={(e) => setEv(k, Number(e.target.value))}
              className="ev-input"
              style={{ width: '100%' }}
            />
          </label>
        ))}
      </div>

      <div className="section-head">Boosts (stages)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 6 }}>
        {BOOST_KEYS.map((k) => (
          <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-dim)', textTransform: 'uppercase' }}>{k}</span>
            <input
              type="number"
              min={-6}
              max={6}
              value={spec.boosts[k] ?? 0}
              onChange={(e) => setBoost(k, Number(e.target.value))}
              className="ev-input"
              style={{ width: '100%' }}
            />
          </label>
        ))}
      </div>

      <div className="section-head">Moves</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {[0, 1, 2, 3].map((i) => (
          <label key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>Move {i + 1}</span>
            <input
              list={`moves-${title}-${i}`}
              value={spec.moves[i]}
              onChange={(e) => setMove(i, e.target.value)}
              placeholder="e.g. Earthquake"
            />
            {learnsetNames.length > 0 && (
              <datalist id={`moves-${title}-${i}`}>
                {learnsetNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
          </label>
        ))}
      </div>

      {species && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-dim)' }}>
          {species.types.map((t) => (
            <TypeBadge key={t} type={t} />
          ))}{' '}
          · BST {Object.values(species.baseStats).reduce((a, b) => a + b, 0)}
        </div>
      )}
    </div>
  );
}

function FieldPanel({ field, onChange }: { field: FieldSpec; onChange: (f: FieldSpec) => void }) {
  const update = <K extends keyof FieldSpec>(k: K, v: FieldSpec[K]) => onChange({ ...field, [k]: v });
  const setSide = (side: 'attackerSide' | 'defenderSide', patch: Partial<FieldSpec['attackerSide']>) =>
    onChange({ ...field, [side]: { ...field[side], ...patch } });

  return (
    <div className="panel">
      <div className="section-head">Field</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Weather</span>
          <select value={field.weather} onChange={(e) => update('weather', e.target.value as Weather)}>
            {WEATHERS.map((w) => (
              <option key={w.id || 'none'} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>Terrain</span>
          <select value={field.terrain} onChange={(e) => update('terrain', e.target.value as Terrain)}>
            {TERRAINS.map((t) => (
              <option key={t.id || 'none'} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input type="checkbox" checked={field.isGravity} onChange={(e) => update('isGravity', e.target.checked)} />
        Gravity active
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SidePanel
          label="Your side"
          side={field.attackerSide}
          onChange={(patch) => setSide('attackerSide', patch)}
        />
        <SidePanel
          label="Opponent side"
          side={field.defenderSide}
          onChange={(patch) => setSide('defenderSide', patch)}
        />
      </div>
    </div>
  );
}

function SidePanel({
  label,
  side,
  onChange,
}: {
  label: string;
  side: FieldSpec['attackerSide'];
  onChange: (patch: Partial<FieldSpec['attackerSide']>) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <label>
          Spikes:{' '}
          <select
            value={side.spikes}
            onChange={(e) => onChange({ spikes: Number(e.target.value) as 0 | 1 | 2 | 3 })}
          >
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={side.stealthRock}
            onChange={(e) => onChange({ stealthRock: e.target.checked })}
          />{' '}
          Stealth Rock
        </label>
        <label>
          <input
            type="checkbox"
            checked={side.steelsurge}
            onChange={(e) => onChange({ steelsurge: e.target.checked })}
          />{' '}
          Steelsurge
        </label>
        <label>
          <input type="checkbox" checked={side.isReflect} onChange={(e) => onChange({ isReflect: e.target.checked })} />{' '}
          Reflect
        </label>
        <label>
          <input
            type="checkbox"
            checked={side.isLightScreen}
            onChange={(e) => onChange({ isLightScreen: e.target.checked })}
          />{' '}
          Light Screen
        </label>
        <label>
          <input
            type="checkbox"
            checked={side.isAuroraVeil}
            onChange={(e) => onChange({ isAuroraVeil: e.target.checked })}
          />{' '}
          Aurora Veil
        </label>
        <label>
          <input
            type="checkbox"
            checked={side.isTailwind}
            onChange={(e) => onChange({ isTailwind: e.target.checked })}
          />{' '}
          Tailwind
        </label>
      </div>
    </div>
  );
}
