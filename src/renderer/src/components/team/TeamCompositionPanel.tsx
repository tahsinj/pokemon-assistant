/**
 * Team-composition / role-audit panel for the Team Builder. Shows what role
 * each squad member fills, a functional-role checklist, prioritized gap
 * insights ("you're missing a LEAD!"), and per-gap fill suggestions pulled
 * from the PC (then the dex).
 */
import { useMemo, useState } from 'react';
import type { Move, Pokemon } from '../../lib/types';
import type { RoleSlotInput } from '../../lib/teamRoles';
import type { SmogonBundle, SmogonSpeciesIntel } from '../../lib/smogon';
import {
  auditTeam,
  suggestForGap,
  type CompositionGap,
  type Severity,
} from '../../lib/teamComposition';
import { PokemonSprite } from '../PokemonSprite';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'var(--hud-danger)',
  warning: 'var(--hud-accent-2)',
  info: 'var(--ink-2)',
};

export function TeamCompositionPanel({
  slots,
  pcMons,
  dex,
  smogon,
  moves,
  intelBy,
  onAdd,
}: {
  slots: RoleSlotInput[];
  pcMons: Pokemon[];
  dex: Pokemon[];
  smogon: SmogonBundle | null;
  moves: Record<string, Move>;
  intelBy: (id: string) => SmogonSpeciesIntel | null;
  onAdd: (p: Pokemon) => void;
}) {
  const slotKey = slots.map((s) => `${s.p.id}:${(s.detail?.moves ?? []).join('|')}`).join(',');
  const audit = useMemo(
    () => auditTeam(slots, intelBy, moves),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slotKey, moves, smogon],
  );

  const [openGap, setOpenGap] = useState<string | null>(null);
  const teamMons = useMemo(() => slots.map((s) => s.p), [slotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions = useMemo(() => {
    const gap = audit.gaps.find((g) => g.id === openGap);
    if (!gap || !gap.fillRole) return [];
    return suggestForGap(gap, teamMons, pcMons, dex, smogon, moves, intelBy, 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openGap, audit, teamMons, pcMons, dex, smogon, moves]);

  const covered = audit.checklist.filter((r) => r.present).length;

  return (
    <div className="mono-panel p-3 rounded-[10px]">
      <div className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest text-accent-2 mb-2">
        TEAM COMPOSITION
        <span className="text-ink-2"> · {covered}/{audit.checklist.length} roles covered</span>
      </div>

      {/* Per-slot role chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {audit.members.map((m) => {
          const inferred = m.moveSource === 'learnset' || m.moveSource === 'none';
          return (
            <div
              key={m.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-[10px] border border-white/10 bg-white/[.03]"
              title={inferred ? 'Roles inferred from a likely set - add this slot’s moves for a precise read' : undefined}
            >
              <PokemonSprite dex={m.p.dex} name={m.p.name} size="xs" />
              <span className="min-w-0">
                <span className="block font-display text-[13px] font-semibold text-ink-0 truncate">
                  {m.p.name}
                </span>
                <span className="flex flex-wrap gap-1 mt-0.5">
                  {m.tags.length === 0 ? (
                    <span className="font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">
                      no clear role
                    </span>
                  ) : (
                    m.tags.map((t) => (
                      <span
                        key={t}
                        className="font-mono-hud text-[14px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/40 text-accent-2"
                      >
                        {inferred ? '~' : ''}{ROLE_SHORT[t]}
                      </span>
                    ))
                  )}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Role checklist */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-3 gap-y-1.5 mb-3">
        {audit.checklist.map((row) => (
          <div
            key={row.role}
            className="flex items-center gap-1.5 font-mono-hud text-[14px] uppercase tracking-wider"
            title={row.present ? row.filledBy.join(', ') : 'no member fills this role'}
          >
            <span style={{ color: row.present ? '#7cd87b' : 'var(--ink-2)' }}>
              {row.present ? '✓' : '✗'}
            </span>
            <span style={{ color: row.present ? 'var(--ink-1)' : 'var(--ink-2)' }}>{row.label}</span>
          </div>
        ))}
      </div>

      {/* Prioritized insights */}
      {audit.gaps.length === 0 ? (
        <div className="font-mono-hud text-[14px]" style={{ color: '#7cd87b' }}>
          ✓ Solid composition - no glaring role gaps.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {audit.gaps.map((gap) => (
            <GapRow
              key={gap.id}
              gap={gap}
              open={openGap === gap.id}
              onToggle={() => setOpenGap((cur) => (cur === gap.id ? null : gap.id))}
              suggestions={openGap === gap.id ? suggestions : []}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GapRow({
  gap,
  open,
  onToggle,
  suggestions,
  onAdd,
}: {
  gap: CompositionGap;
  open: boolean;
  onToggle: () => void;
  suggestions: ReturnType<typeof suggestForGap>;
  onAdd: (p: Pokemon) => void;
}) {
  const color = SEVERITY_COLOR[gap.severity];
  const clickable = gap.fillRole !== null;
  return (
    <div>
      <button
        type="button"
        onClick={clickable ? onToggle : undefined}
        aria-expanded={open}
        className={`w-full text-left font-mono-hud text-[14px] leading-snug flex items-start gap-1.5 ${
          clickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
        }`}
        style={{ color }}
      >
        <span className="flex-shrink-0">{gap.severity === 'info' ? '◦' : '⚠'}</span>
        <span className="flex-1">{gap.message}</span>
        {clickable && (
          <span className="flex-shrink-0 text-ink-2">{open ? '▾' : '▸ fixes'}</span>
        )}
      </button>

      {open && clickable && (
        <div className="grid grid-cols-3 gap-2 mt-1.5 mb-1">
          {suggestions.length === 0 ? (
            <div className="col-span-3 font-mono-hud text-[14px] text-ink-2 py-1">
              Nothing in your PC or the legal dex cleanly fills this role.
            </div>
          ) : (
            suggestions.map((s) => (
              <button
                key={s.p.id}
                type="button"
                onClick={() => onAdd(s.p)}
                title="Click to add to the first empty slot"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] border border-white/10 bg-white/[.04] text-left hover:border-accent-2 transition"
              >
                <PokemonSprite dex={s.p.dex} name={s.p.name} size="xs" />
                <span className="flex-1 min-w-0">
                  <span className="block font-display text-[14px] font-semibold truncate text-ink-0">
                    {s.p.name}
                  </span>
                  <span className="block font-mono-hud text-[14px] text-ink-2 truncate">
                    {s.reason}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const ROLE_SHORT: Record<string, string> = {
  'hazard-setter': 'hazards',
  'hazard-control': 'hazard ctrl',
  'physical-attacker': 'physical',
  'special-attacker': 'special',
  'setup-sweeper': 'setup',
  'revenge-killer': 'revenge',
  wall: 'wall',
  pivot: 'pivot',
  cleric: 'support',
  'speed-control': 'speed',
};
