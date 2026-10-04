import type { DamageOutcome } from './damage';

/** Short KO label for a calc result, with the color the calc pages show it in. */
export function koText(d: DamageOutcome): { text: string; color: string } {
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

/** Damage range as "min-max%", or a word when the move does nothing. */
export function rangeText(d: DamageOutcome): string {
  if (d.error) return 'calc error';
  if (d.isZero) return d.category === 'Status' ? '-' : 'immune';
  return `${d.pctMin.toFixed(1)}–${d.pctMax.toFixed(1)}%`;
}

/** Strongest result first: surer KOs, then more damage. Status and errors last. */
export function byThreat(a: DamageOutcome, b: DamageOutcome): number {
  const score = (d: DamageOutcome) =>
    d.error || d.isZero ? -1 : (d.ko.n > 0 ? (7 - Math.min(d.ko.n, 6)) * 2 + d.ko.chance : 0) * 1000 + d.pctMax;
  return score(b) - score(a);
}

export function hpColorFor(pct: number): string {
  return pct > 50 ? '#7cd87b' : pct > 25 ? '#ffd34d' : 'var(--hud-danger)';
}
