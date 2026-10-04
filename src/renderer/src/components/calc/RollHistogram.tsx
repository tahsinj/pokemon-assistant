import type { DamageOutcome } from '../../lib/battle/damage';

/** The 16 damage rolls of one move as bars, with the target's current HP marked. */
export function RollHistogram({ d, targetHp }: { d: DamageOutcome; targetHp: number }) {
  if (!d.rolls.length || d.isZero) return null;
  const pctOf = (roll: number) => (d.max === d.min ? d.pctMax : d.pctMin + ((roll - d.min) / (d.max - d.min)) * (d.pctMax - d.pctMin));
  const top = Math.max(d.pctMax, targetHp, 1);
  const kos = d.rolls.filter((r) => pctOf(r) >= targetHp).length;
  return (
    <div data-ui="roll-histogram" className="rounded-[10px] border border-white/10 bg-black/20 px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <span className="font-display text-[14px] font-semibold text-ink-0">{d.moveName}: damage rolls</span>
        <span className="font-sans text-[13px] text-ink-1">{d.ko.text || `${kos} of ${d.rolls.length} rolls KO from ${Math.round(targetHp)}%`}</span>
      </div>
      <div className="relative flex items-end gap-[3px] h-[64px]">
        <div
          className="absolute left-0 right-0 border-t border-dashed border-danger/70"
          style={{ bottom: `${(targetHp / top) * 100}%` }}
          title={`Target HP: ${Math.round(targetHp)}%`}
        />
        {d.rolls.map((r, i) => {
          const pct = pctOf(r);
          return (
            <div
              key={i}
              className="flex-1 rounded-t-[3px]"
              style={{ height: `${Math.max(2, (pct / top) * 100)}%`, background: pct >= targetHp ? 'var(--hud-danger)' : 'var(--hud-accent-2)' }}
              title={`${r} damage (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex justify-between font-mono-hud text-[14px] text-ink-2 mt-1">
        <span>{d.pctMin.toFixed(1)}%</span>
        <span>{d.pctMax.toFixed(1)}%</span>
      </div>
    </div>
  );
}
