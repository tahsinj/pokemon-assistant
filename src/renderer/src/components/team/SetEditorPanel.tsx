/**
 * Inline per-slot set editor for the Team Builder: moves, ability, item,
 * nature, level, EVs/IVs, plus one-click Smogon quick-set fills ("Showdown
 * Usage" + curated sets). Edits a `MemberDetail` in place - the caller owns
 * the slot state and persistence.
 */
import { useMemo } from 'react';
import type { BaseStats, HeldItem, Move, Pokemon, StatKey } from '../../lib/types';
import type { MemberDetail } from '../../lib/bridgeTypes';
import type { SmogonSpeciesIntel } from '../../lib/smogon';
import { NATURES, STAT_LABELS, calcAllStats } from '../../lib/stats';
import { abilityName, moveName } from '../../lib/displayNames';
import { allSetFills, sortMovesByUsage, type SetFill } from '../../lib/usageSets';
import { ItemSearchInput } from '../ItemSearchInput';
import { PokemonSprite } from '../PokemonSprite';
import { TypeChip } from '../hud/HudPrimitives';

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const FILL_31: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const FILL_0: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function toStats(rec: Record<string, number> | null | undefined, fallback: BaseStats): BaseStats {
  return { ...fallback, ...(rec ?? {}) };
}

/** A detail with every field concrete, for editing. */
interface DraftSet {
  item: string | null;
  ability: string | null;
  nature: string;
  level: number;
  ivs: BaseStats;
  evs: BaseStats;
  moves: [string, string, string, string];
}

function toDraft(detail: MemberDetail | null): DraftSet {
  const mv = (detail?.moves ?? []).slice(0, 4);
  while (mv.length < 4) mv.push('');
  return {
    item: detail?.item ?? null,
    ability: detail?.ability ?? null,
    nature: detail?.nature ?? 'Hardy',
    level: detail?.level ?? 100,
    ivs: toStats(detail?.ivs, FILL_31),
    evs: toStats(detail?.evs, FILL_0),
    moves: [mv[0], mv[1], mv[2], mv[3]] as [string, string, string, string],
  };
}

function toDetail(d: DraftSet): MemberDetail {
  const moves = d.moves.filter((m) => m.trim().length > 0);
  return {
    item: d.item,
    ability: d.ability,
    nature: d.nature,
    level: d.level,
    ivs: { ...d.ivs },
    evs: { ...d.evs },
    moves: moves.length ? moves : null,
  };
}

export function SetEditorPanel({
  species,
  detail,
  onChange,
  onSwapSpecies,
  onRemove,
  onClose,
  moves,
  items,
  intel,
}: {
  species: Pokemon;
  detail: MemberDetail | null;
  onChange: (next: MemberDetail) => void;
  onSwapSpecies: () => void;
  onRemove: () => void;
  onClose: () => void;
  moves: Record<string, Move>;
  items: HeldItem[];
  intel: SmogonSpeciesIntel | null;
}) {
  // Stored details may carry id-form names ("protean", "watershuriken") -
  // normalize to display names so both the UI and future saves are clean.
  const draft = useMemo(() => {
    const d = toDraft(detail);
    if (d.ability) d.ability = abilityName(d.ability);
    d.moves = d.moves.map((m) => (m ? moveName(m, moves) : m)) as DraftSet['moves'];
    return d;
  }, [detail, moves]);

  const learnset = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const lm of species.moves) {
      const mv = moves[lm.move];
      if (mv && !seen.has(mv.id)) {
        seen.add(mv.id);
        out.push(mv.name);
      }
    }
    return sortMovesByUsage(out, intel);
  }, [species, moves, intel]);

  const quickSets = useMemo(() => allSetFills(species, intel), [species, intel]);

  const abilities = useMemo(() => {
    const all = [...species.abilities, ...species.hiddenAbilities].map(abilityName);
    return [...new Set(all)];
  }, [species]);

  const evTotal = STAT_KEYS.reduce((sum, k) => sum + draft.evs[k], 0);
  const finalStats = useMemo(
    () => calcAllStats(species.baseStats, draft.ivs, draft.evs, draft.level, draft.nature),
    [species, draft],
  );

  const commit = (patch: Partial<DraftSet>) => onChange(toDetail({ ...draft, ...patch }));

  const applyFill = (fill: SetFill) => {
    const mv = fill.moves.slice(0, 4);
    while (mv.length < 4) mv.push('');
    onChange(
      toDetail({
        ...draft,
        item: fill.item ?? draft.item,
        ability: fill.ability ?? draft.ability,
        nature: fill.nature ?? draft.nature,
        ivs: { ...fill.ivs },
        evs: { ...fill.evs },
        moves: [mv[0], mv[1], mv[2], mv[3]] as [string, string, string, string],
      }),
    );
  };

  const setStat = (which: 'evs' | 'ivs', k: StatKey, v: number) => {
    const max = which === 'evs' ? 252 : 31;
    const clamped = Math.max(0, Math.min(max, Number.isFinite(v) ? Math.round(v) : 0));
    commit({ [which]: { ...draft[which], [k]: clamped } } as Partial<DraftSet>);
  };

  const setMove = (i: number, name: string) => {
    const next = [...draft.moves] as DraftSet['moves'];
    next[i] = name;
    commit({ moves: next });
  };

  const label = (text: string) => (
    <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">{text}</span>
  );

  return (
    <div className="mono-panel p-3 rounded-[10px] hud-form">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <PokemonSprite dex={species.dex} name={species.name} size="sm" />
        <div className="min-w-0">
          <div className="font-display text-[16px] font-bold text-ink-0">{species.name}</div>
          <div className="flex gap-1 mt-0.5">
            {species.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} />
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="chunky ghost font-display text-[11px]"
            style={{ padding: '4px 10px' }}
            onClick={onSwapSpecies}
          >
            SWAP SPECIES
          </button>
          <button
            type="button"
            className="chunky ghost font-display text-[11px]"
            style={{ '--c': 'var(--hud-danger)', padding: '4px 10px' } as React.CSSProperties}
            onClick={onRemove}
          >
            REMOVE
          </button>
          <button
            type="button"
            className="chunky font-display text-[11px]"
            style={{ padding: '4px 10px' }}
            onClick={onClose}
          >
            DONE
          </button>
        </div>
      </div>

      {/* Quick sets */}
      {quickSets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">
            Quick set
          </span>
          {quickSets.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => applyFill(f)}
              title={`${f.nature ?? '-'} · ${f.item ?? 'no item'} · ${f.moves.join(' / ')}`}
              className="font-mono-hud text-[12px] px-2.5 py-1 rounded-full border border-white/15 text-ink-1 hover:border-accent-2 hover:text-ink-0 transition"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Ability / item / nature / level */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          {label('Ability')}
          <select value={draft.ability ?? ''} onChange={(e) => commit({ ability: e.target.value || null })}>
            <option value="">-</option>
            {abilities.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {draft.ability && !abilities.includes(draft.ability) && (
              <option value={draft.ability}>{draft.ability}</option>
            )}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {label('Held item')}
          <ItemSearchInput value={draft.item ?? ''} onChange={(v) => commit({ item: v || null })} items={items} />
        </label>
        <label className="flex flex-col gap-1">
          {label('Nature')}
          <select value={draft.nature} onChange={(e) => commit({ nature: e.target.value })}>
            {Object.keys(NATURES).map((n) => {
              const spec = NATURES[n];
              const hint = spec.plus ? ` (+${STAT_LABELS[spec.plus]} −${STAT_LABELS[spec.minus!]})` : '';
              return (
                <option key={n} value={n}>
                  {n}
                  {hint}
                </option>
              );
            })}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {label('Level')}
          <input
            type="number"
            min={1}
            max={100}
            value={draft.level}
            onChange={(e) => commit({ level: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
          />
        </label>
      </div>

      {/* Moves */}
      <div className="grid grid-cols-4 gap-2 mb-2">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="flex flex-col gap-1">
            {label(`Move ${i + 1}`)}
            <input
              list={`set-editor-moves-${species.id}`}
              value={draft.moves[i]}
              onChange={(e) => setMove(i, e.target.value)}
              placeholder="-"
            />
          </label>
        ))}
        <datalist id={`set-editor-moves-${species.id}`}>
          {learnset.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      {/* EVs / IVs / final stats */}
      <div className="grid grid-cols-[64px,repeat(6,1fr)] gap-1.5 items-center">
        <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2" />
        {STAT_KEYS.map((k) => (
          <span
            key={k}
            className="font-mono-hud text-[12px] uppercase tracking-wider text-center text-ink-2"
          >
            {STAT_LABELS[k]}
          </span>
        ))}

        <span
          className="font-mono-hud text-[12px] uppercase tracking-wider"
          style={{ color: evTotal > 510 ? 'var(--hud-danger)' : 'var(--ink-2)' }}
          title="EV total (max 510)"
        >
          EV {evTotal}
        </span>
        {STAT_KEYS.map((k) => (
          <input
            key={`ev-${k}`}
            type="number"
            min={0}
            max={252}
            step={4}
            aria-label={`${STAT_LABELS[k]} EVs`}
            value={draft.evs[k]}
            onChange={(e) => setStat('evs', k, Number(e.target.value))}
            className="no-spin text-center"
          />
        ))}

        <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">IV</span>
        {STAT_KEYS.map((k) => (
          <input
            key={`iv-${k}`}
            type="number"
            min={0}
            max={31}
            aria-label={`${STAT_LABELS[k]} IVs`}
            value={draft.ivs[k]}
            onChange={(e) => setStat('ivs', k, Number(e.target.value))}
            className="no-spin text-center"
          />
        ))}

        <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2">
          LV {draft.level}
        </span>
        {STAT_KEYS.map((k) => {
          const n = NATURES[draft.nature] || {};
          const color = n.plus === k ? 'var(--hud-danger)' : n.minus === k ? '#5ea7ff' : 'var(--ink-0)';
          return (
            <span
              key={`stat-${k}`}
              className="font-mono-hud text-[14px] text-center tabular-nums"
              style={{ color }}
              title={`Final ${STAT_LABELS[k]} at level ${draft.level}`}
            >
              {finalStats[k]}
            </span>
          );
        })}
      </div>
    </div>
  );
}
