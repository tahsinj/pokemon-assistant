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
import { Segmented } from './hud/Segmented';
import { PokemonSprite } from './PokemonSprite';

const RESIST_GREEN = '#7cd87b';

function StatTile({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04] text-center" title={hint}>
      <div className="font-mono-hud text-[12px] uppercase tracking-widest text-ink-2">{k}</div>
      <div className="font-display text-[19px] font-bold text-ink-0 leading-tight mt-0.5">{v}</div>
    </div>
  );
}

function SectionHead({ label, extra }: { label: string; extra?: string }) {
  return (
    <div className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest text-accent-2">
      {label}
      {extra && <span className="text-ink-2"> · {extra}</span>}
    </div>
  );
}

function CoverageRow({ label, types, tone }: { label: string; types: string[]; tone: string }) {
  if (types.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="font-mono-hud text-[12px] uppercase tracking-wider w-24 flex-shrink-0 pt-0.5" style={{ color: tone }}>
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

export function MoveDetail({ m, learners }: { m: Move; learners: MoveLearner[] }) {
  const [methodFilter, setMethodFilter] = useState<LearnMethod | 'all'>('all');
  const isDamaging = m.category !== 'Status' && (m.power ?? 0) > 0;
  const cov = useMemo(() => typeCoverage(m.type), [m.type]);
  const flags = useMemo(() => (m.flags ?? []).filter((f) => FLAG_INFO[f]), [m.flags]);
  const shownLearners = useMemo(
    () => (methodFilter === 'all' ? learners : learners.filter((l) => l.methods.includes(methodFilter))),
    [learners, methodFilter],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Identity */}
      <div>
        <div className="font-display text-[26px] font-bold leading-none text-ink-0">{m.name}</div>
        <div className="flex items-center gap-2 mt-2">
          <TypeChip t={m.type.toLowerCase()} size="md" />
          <span className="font-display text-[13px] font-semibold px-2.5 py-0.5 rounded-full border border-white/15 bg-black/30 text-ink-1">
            {m.category}
          </span>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-2.5">
        <StatTile k="Power" v={m.power ? String(m.power) : '-'} />
        <StatTile
          k="Acc"
          v={m.accuracy === true ? '-' : `${m.accuracy}%`}
          hint={m.accuracy === true ? 'Never misses' : undefined}
        />
        <StatTile k="PP" v={String(m.pp)} />
        <StatTile
          k="Priority"
          v={m.priority === 0 ? '0' : m.priority > 0 ? `+${m.priority}` : String(m.priority)}
          hint={priorityLabel(m.priority)}
        />
      </div>

      {/* Description + meta + flags, in one quiet card */}
      <div className="rounded-[10px] border border-white/10 bg-white/[.04] px-3.5 py-3 flex flex-col gap-2.5">
        {m.desc && <p className="font-mono-hud text-[14px] leading-relaxed text-ink-1">{m.desc}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 font-mono-hud text-[13px] text-ink-1">
          <span>
            <span className="text-ink-2 uppercase tracking-wider">Target </span>
            {targetLabel(m.target)}
          </span>
          <span>
            <span className="text-ink-2 uppercase tracking-wider">Priority </span>
            {priorityLabel(m.priority)}
          </span>
        </div>
        {flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <span
                key={f}
                className="font-display text-[12px] font-semibold px-2 py-0.5 rounded-full border border-white/15 bg-black/30 text-ink-1 cursor-help"
                title={FLAG_INFO[f].desc}
              >
                {FLAG_INFO[f].label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Type coverage */}
      {isDamaging && (cov.strong.length > 0 || cov.weak.length > 0 || cov.immune.length > 0) && (
        <div className="rounded-[10px] border border-white/10 bg-white/[.04] px-3.5 py-3 flex flex-col gap-2">
          <SectionHead label="Coverage" extra="vs. single types" />
          <CoverageRow label="Super (2×)" types={cov.strong} tone={RESIST_GREEN} />
          <CoverageRow label="Resisted" types={cov.weak} tone="var(--ink-2)" />
          <CoverageRow label="No effect" types={cov.immune} tone="var(--hud-danger)" />
        </div>
      )}

      {/* Learners */}
      <div className="flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionHead label="Learned by" extra={`${learners.length} species`} />
          <Segmented
            value={methodFilter}
            onChange={setMethodFilter}
            options={[
              { id: 'all', label: 'All' },
              { id: 'level', label: 'Level' },
              { id: 'tm', label: 'TM' },
              { id: 'egg', label: 'Egg' },
              { id: 'tutor', label: 'Tutor' },
            ]}
          />
        </div>
        {shownLearners.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-ink-2 px-2 py-4 text-center">
            No species learn this move that way.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-[34vh] overflow-y-auto pr-1 no-scrollbar">
            {shownLearners.map((l) => (
              <div
                key={l.dex}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03]"
              >
                <PokemonSprite dex={l.dex} name={l.name} size="xs" />
                <span className="font-display text-[14px] font-semibold truncate flex-1 min-w-0 text-ink-0">
                  {l.name}
                </span>
                <span className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2 flex-shrink-0">
                  {l.methods.includes('level') && l.level != null ? `Lv ${l.level}` : METHOD_LABEL[l.methods[0]]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
