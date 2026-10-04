/** Pieces shared by the practice battle and replay views. */
import { useEffect, useMemo, useRef } from 'react';
import { SectionHead } from '../hud/ModuleFrame';
import { TypeChip } from '../hud/HudPrimitives';
import { PokemonSprite } from '../PokemonSprite';
import { hpColorFor } from '../../lib/battle/koText';
import { dexNumber, type ClientBattle } from '../../engine/clientState';
import { describeLine, type Names } from '../../engine/describe';

export function ActiveCard({
  battle,
  side,
  label,
  exactHp = side === 'p1',
}: {
  battle: ClientBattle;
  side: 'p1' | 'p2';
  label: string;
  /** Show HP as current/max (your own side in a live battle) instead of a percentage. */
  exactHp?: boolean;
}) {
  const mon = battle[side].active[0];
  // The client only knows Pokémon that have appeared, so count faints against the team size.
  const total = Math.max(battle[side].totalPokemon, battle[side].team.length) || 6;
  const left = total - battle[side].team.filter((p) => p.fainted).length;
  if (!mon) {
    return (
      <div className="mono-panel rounded-[12px] p-3">
        <span className="font-sans text-[13px] text-ink-2">
          {label}:{' '}
          {battle[side].team.length && left === 0
            ? 'no Pokémon left.'
            : battle[side].team.length
              ? battle[side].team.map((p) => p.speciesForme).join(', ')
              : 'waiting for the first switch-in.'}
        </span>
      </div>
    );
  }
  const pct = mon.maxhp ? Math.round((100 * mon.hp) / mon.maxhp) : 0;
  const color = hpColorFor(pct);
  const boosts = Object.entries(mon.boosts).filter(([, v]) => v);
  return (
    <div data-ui={`active-${side}`} className="mono-panel rounded-[12px] p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-2 font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">
        <span className="truncate">{label}</span>
        <span>
          {left}/{total} left
        </span>
      </div>
      <div className="flex items-center gap-3 min-w-0">
        <PokemonSprite dex={dexNumber(mon.speciesForme)} name={mon.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-bold text-ink-0 truncate">{mon.name}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span className="font-mono-hud text-[14px] text-ink-2">L{mon.level}</span>
            {mon.status && <span className="font-mono-hud text-[14px] uppercase text-danger">{mon.status}</span>}
            {mon.terastallized && <TypeChip t={mon.terastallized.toLowerCase()} />}
            {boosts.map(([k, v]) => (
              <span key={k} className="font-mono-hud text-[14px]" style={{ color: (v ?? 0) > 0 ? '#7cd87b' : 'var(--hud-danger)' }}>
                {(v ?? 0) > 0 ? '+' : ''}
                {v} {k}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="relative h-[10px] rounded-full bg-black/50 overflow-hidden border border-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="font-mono-hud text-[14px] text-ink-1">
        {exactHp ? `${mon.hp}/${mon.maxhp} HP` : `${pct}% HP`}
      </div>
    </div>
  );
}

/** The protocol log as sentences, newest at the bottom. */
export function BattleLog({ lines, names }: { lines: readonly string[]; names: Names }) {
  const log = useMemo(
    () => lines.map((l) => describeLine(l, names)).filter((l): l is string => !!l),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, names.p1, names.p2],
  );
  // Keep the newest line in view without scrolling the page around it.
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [log.length]);
  return (
    <>
      <SectionHead label="Battle log" />
      <div ref={box} data-ui="battle-log" className="overflow-y-auto flex flex-col gap-0.5 pr-1">
        {log.map((line, i) =>
          /^Turn \d+$/.test(line) ? (
            <div key={i} className="font-mono-hud text-[14px] uppercase tracking-wider text-accent-2 mt-2">
              {line}
            </div>
          ) : (
            <div key={i} className="font-sans text-[13px] text-ink-1 leading-snug">
              {line}
            </div>
          ),
        )}
      </div>
    </>
  );
}

/** Position value per turn from your side: above the middle line you are ahead. */
export function EvalGraph({ evals, ahead = 'you are', behind = 'the bot is' }: { evals: number[]; ahead?: string; behind?: string }) {
  const w = 300;
  const h = 56;
  const span = Math.max(3, ...evals.map((v) => Math.abs(Math.max(-6, Math.min(6, v)))));
  const x = (i: number) => (evals.length === 1 ? w / 2 : (i / (evals.length - 1)) * w);
  const y = (v: number) => h / 2 - (Math.max(-span, Math.min(span, v)) / span) * (h / 2 - 3);
  const points = evals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = evals[evals.length - 1];
  return (
    <div data-ui="eval-graph" className="mb-3">
      <SectionHead label="Position" extra={last > 0.25 ? `${ahead} ahead` : last < -0.25 ? `${behind} ahead` : 'even'} />
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[56px]" role="img" aria-label="Position value by turn">
        <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke="rgba(255,255,255,.15)" strokeDasharray="3 3" />
        <polyline points={points} fill="none" stroke="var(--hud-accent-2)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
