import type { DamageOutcome } from '../../lib/battle/damage';
import { byThreat, hpColorFor, koText, rangeText } from '../../lib/battle/koText';
import { PokemonSprite } from '../PokemonSprite';
import { TypeChip } from '../hud/HudPrimitives';

export interface MatrixRow {
  slot: number;
  name: string;
  dex: number;
  hpPercent: number;
  /** This member's moves into the target. */
  outcomes: DamageOutcome[];
  /** The target's moves into this member. */
  reverse: DamageOutcome[];
}

/**
 * Every member of one roster against the other side's active Pokémon: what
 * each member does to it, strongest move first, and the target's best move
 * back. Answers "who should I bring in?" at a glance.
 */
export function TeamMatrix({
  rows,
  target,
  activeSlot,
  moveType,
  onOpen,
}: {
  rows: MatrixRow[];
  target: string | null;
  activeSlot: number;
  moveType: (moveName: string) => string | undefined;
  onOpen: (slot: number) => void;
}) {
  if (!target) {
    return <p className="text-[14px] text-ink-2 text-center py-6">Add an opposing Pokémon to compare your team against it.</p>;
  }
  if (!rows.length) {
    return <p className="text-[14px] text-ink-2 text-center py-6">Add Pokémon to your roster to compare them against {target}.</p>;
  }
  return (
    <div data-ui="team-matrix" className="flex flex-col gap-2">
      <div className="grid grid-cols-[150px,minmax(0,1fr),minmax(0,240px),auto] gap-3 px-3 font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">
        <span>Your Pokémon</span>
        <span>Into {target}</span>
        <span>{target}'s best move back</span>
        <span />
      </div>
      {rows.map((row) => {
        const mine = row.outcomes.filter(damaging).sort(byThreat);
        const back = row.reverse.filter(damaging).sort(byThreat)[0];
        return (
          <div
            key={row.slot}
            className={`grid grid-cols-[150px,minmax(0,1fr),minmax(0,240px),auto] gap-3 items-center rounded-[12px] border px-3 py-2 ${
              row.slot === activeSlot ? 'border-accent-2/60 bg-white/[.06]' : 'border-white/10 bg-white/[.03]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <PokemonSprite dex={row.dex} name={row.name} size="xs" />
              <div className="min-w-0">
                <div data-ui="species-name" className="font-display text-[15px] font-bold text-ink-0 truncate">
                  {row.name}
                </div>
                <div className="font-mono-hud text-[14px]" style={{ color: hpColorFor(row.hpPercent) }}>
                  {row.hpPercent}% HP
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {mine.length === 0 && <span className="text-[13px] text-ink-2">No damaging moves.</span>}
              {mine.map((d, i) => (
                <OutcomeChip key={`${d.moveName}-${i}`} d={d} type={moveType(d.moveName)} />
              ))}
            </div>
            <div className="min-w-0">
              {back ? (
                <OutcomeChip d={back} type={moveType(back.moveName)} danger />
              ) : (
                <span className="text-[13px] text-ink-2">No damaging moves.</span>
              )}
            </div>
            <button
              type="button"
              className="chunky ghost font-display text-[12px]"
              style={{ padding: '4px 10px' }}
              onClick={() => onOpen(row.slot)}
              title={`Make ${row.name} your active Pokémon and open the full calc`}
            >
              OPEN
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Status moves have no damage to compare. */
const damaging = (d: DamageOutcome) => d.category !== 'Status';

function OutcomeChip({ d, type, danger }: { d: DamageOutcome; type?: string; danger?: boolean }) {
  const ko = koText(d);
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-[8px] border px-2 py-1 max-w-full ${
        danger ? 'border-danger/40 bg-danger/[.08]' : 'border-white/10 bg-black/25'
      }`}
      title={d.desc || undefined}
    >
      {type && <TypeChip t={type.toLowerCase()} />}
      <span className="font-display text-[13px] font-semibold text-ink-0">{d.moveName}</span>
      <span className="font-mono-hud text-[14px] tabular-nums text-ink-1 whitespace-nowrap">
        {rangeText(d)}
        {!d.isZero && !d.error && (
          <span className="ml-1.5" style={{ color: ko.color }}>
            {ko.text}
          </span>
        )}
      </span>
    </span>
  );
}
