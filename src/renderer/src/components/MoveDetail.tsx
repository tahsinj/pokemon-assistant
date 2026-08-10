import { useMemo, useState } from 'react';
import type { Move } from '../lib/types';
import {
  FLAG_INFO,
  METHOD_LABEL,
  priorityLabel,
  targetLabel,
  typeCoverage,
  type LearnMethod,
  type MoveLearner,
} from '../lib/moveInfo';
import { TypeChip } from './hud/HudPrimitives';
import { PokemonSprite } from './PokemonSprite';

const CATEGORY_STYLE: Record<Move['category'], { bg: string; label: string }> = {
  Physical: { bg: 'rgba(255,120,80,.22)', label: 'Physical' },
  Special: { bg: 'rgba(90,160,255,.22)', label: 'Special' },
  Status: { bg: 'rgba(170,170,170,.20)', label: 'Status' },
};

function StatTile({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="rounded-[10px] bg-white/[.04] border border-white/10 px-3 py-2 text-center" title={hint}>
      <div className="font-mono-hud text-[12px] uppercase tracking-widest text-[var(--ink-2)]">{k}</div>
      <div className="font-display text-[20px] font-bold text-[var(--ink-0)] leading-tight mt-0.5">{v}</div>
    </div>
  );
}

function CoverageRow({ label, types, tone }: { label: string; types: string[]; tone: string }) {
  if (types.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="font-mono-hud text-[12px] uppercase tracking-wider w-20 flex-shrink-0 pt-1" style={{ color: tone }}>
        {label}
      </span>
      <span className="flex flex-wrap gap-1">
        {types.map((t) => (
          <TypeChip key={t} t={t} />
        ))}
      </span>
    </div>
  );
}

const METHOD_FILTERS: { id: LearnMethod | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'level', label: 'Level' },
  { id: 'tm', label: 'TM' },
  { id: 'egg', label: 'Egg' },
  { id: 'tutor', label: 'Tutor' },
];

export function MoveDetail({ m, learners }: { m: Move; learners: MoveLearner[] }) {
  const [methodFilter, setMethodFilter] = useState<LearnMethod | 'all'>('all');
  const cat = CATEGORY_STYLE[m.category];
  const isDamaging = m.category !== 'Status' && (m.power ?? 0) > 0;
  const cov = useMemo(() => typeCoverage(m.type), [m.type]);
  const flags = useMemo(() => (m.flags ?? []).filter((f) => FLAG_INFO[f]), [m.flags]);

  const shownLearners = useMemo(
    () => (methodFilter === 'all' ? learners : learners.filter((l) => l.methods.includes(methodFilter))),
    [learners, methodFilter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-[26px] font-bold leading-none text-[var(--ink-0)]">{m.name}</div>
          <div className="flex items-center gap-2 mt-2">
            <TypeChip t={m.type.toLowerCase()} size="md" />
            <span
              className="font-mono-hud text-[12px] uppercase tracking-widest px-2.5 py-1 rounded-full text-[var(--ink-0)]"
              style={{ background: cat.bg }}
            >
              {cat.label}
            </span>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-2">
        <StatTile k="Power" v={m.power ? String(m.power) : '-'} />
        <StatTile k="Acc" v={m.accuracy === true ? '-' : `${m.accuracy}%`} hint={m.accuracy === true ? 'Never misses' : undefined} />
        <StatTile k="PP" v={String(m.pp)} />
        <StatTile k="Priority" v={m.priority === 0 ? '0' : (m.priority > 0 ? `+${m.priority}` : String(m.priority))} hint={priorityLabel(m.priority)} />
      </div>

      {/* Description */}
      {m.desc && <p className="font-mono-hud text-[14px] leading-relaxed text-[var(--ink-1)]">{m.desc}</p>}

      {/* Meta: target + priority bracket */}
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono-hud text-[13px] text-[var(--ink-1)]">
        <span>
          <span className="text-[var(--ink-2)] uppercase tracking-wider">Target </span>
          {targetLabel(m.target)}
        </span>
        <span>
          <span className="text-[var(--ink-2)] uppercase tracking-wider">Priority </span>
          {priorityLabel(m.priority)}
        </span>
      </div>

      {/* Flags */}
      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <span
              key={f}
              className="font-mono-hud text-[12px] px-2 py-1 rounded-full bg-white/[.05] border border-white/10 text-[var(--ink-1)] cursor-help"
              title={FLAG_INFO[f].desc}
            >
              {FLAG_INFO[f].label}
            </span>
          ))}
        </div>
      )}

      {/* Type coverage */}
      {isDamaging && (cov.strong.length > 0 || cov.weak.length > 0 || cov.immune.length > 0) && (
        <div className="rounded-[12px] bg-white/[.03] border border-white/10 p-3 flex flex-col gap-2">
          <div className="font-mono-hud text-[13px] uppercase tracking-widest text-[var(--hud-accent-2)]">◢ Coverage</div>
          <CoverageRow label="Super (2×)" types={cov.strong} tone="var(--hud-ok, #56e6c2)" />
          <CoverageRow label="Resisted" types={cov.weak} tone="var(--ink-2)" />
          <CoverageRow label="No effect" types={cov.immune} tone="var(--hud-danger, #ff6b6b)" />
        </div>
      )}

      {/* Learners */}
      <div className="flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-mono-hud text-[13px] uppercase tracking-widest text-[var(--hud-accent-2)]">
            ◢ Learned by · <span className="text-[var(--ink-2)]">{learners.length} species</span>
          </div>
          <div className="flex gap-1">
            {METHOD_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setMethodFilter(f.id)}
                aria-pressed={methodFilter === f.id}
                className={`font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${
                  methodFilter === f.id
                    ? 'bg-white/10 border-[var(--hud-accent-2)]/50 text-[var(--ink-0)]'
                    : 'bg-white/[.03] border-white/10 text-[var(--ink-2)] hover:bg-white/[.06]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {shownLearners.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-[var(--ink-2)] px-2 py-4 text-center">
            No species learn this move by that method.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-[34vh] overflow-y-auto pr-1 no-scrollbar">
            {shownLearners.map((l) => (
              <div
                key={l.dex}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[9px] bg-white/[.03] border border-white/5"
              >
                <PokemonSprite dex={l.dex} name={l.name} size="xs" />
                <span className="font-display text-[14px] font-semibold truncate flex-1 min-w-0 text-[var(--ink-0)]">
                  {l.name}
                </span>
                <span className="font-mono-hud text-[11px] text-[var(--ink-2)] flex-shrink-0">
                  {l.methods.includes('level') && l.level != null ? `Lv${l.level}` : METHOD_LABEL[l.methods[0]]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
