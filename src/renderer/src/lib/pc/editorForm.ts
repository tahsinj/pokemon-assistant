import type { PcStatSpread } from '../bridgeTypes';
import type { StatKey } from '../types';
import { DEFAULT_IVS, STAT_ORDER, ZERO_EVS } from './defaults';

export interface NumericFormFields {
  level: string;
  ivs: Record<StatKey, string>;
  evs: Record<StatKey, string>;
}

export function numericFormFromSpread(
  level: number,
  ivs: PcStatSpread,
  evs: PcStatSpread,
): NumericFormFields {
  return {
    level: String(level),
    ivs: Object.fromEntries(STAT_ORDER.map((k) => [k, String(ivs[k])])) as Record<StatKey, string>,
    evs: Object.fromEntries(STAT_ORDER.map((k) => [k, String(evs[k])])) as Record<StatKey, string>,
  };
}

function parseStatField(
  raw: string,
  min: number,
  max: number,
  emptyDefault: number,
  label: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const t = raw.trim();
  if (t === '') return { ok: true, value: emptyDefault };
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, message: `${label} must be a whole number.` };
  }
  if (n < min || n > max) {
    return { ok: false, message: `${label} must be between ${min} and ${max}.` };
  }
  return { ok: true, value: n };
}

export function parseNumericForm(form: NumericFormFields): {
  ok: true;
  level: number;
  ivs: PcStatSpread;
  evs: PcStatSpread;
  evTotal: number;
} | { ok: false; message: string } {
  const levelR = parseStatField(form.level, 1, 100, 50, 'Level');
  if (!levelR.ok) return levelR;

  const ivs = { ...DEFAULT_IVS };
  for (const k of STAT_ORDER) {
    const r = parseStatField(form.ivs[k], 0, 31, DEFAULT_IVS[k], `IV ${k.toUpperCase()}`);
    if (!r.ok) return r;
    ivs[k] = r.value;
  }

  const evs = { ...ZERO_EVS };
  let evTotal = 0;
  for (const k of STAT_ORDER) {
    const r = parseStatField(form.evs[k], 0, 252, 0, `EV ${k.toUpperCase()}`);
    if (!r.ok) return r;
    evs[k] = r.value;
    evTotal += r.value;
  }
  if (evTotal > 510) {
    return { ok: false, message: `EV total is ${evTotal}; maximum is 510.` };
  }

  return { ok: true, level: levelR.value, ivs, evs, evTotal };
}

/** Lenient parse for live stat preview while typing. */
export function previewNumericForm(
  form: NumericFormFields,
  fallback: { level: number; ivs: PcStatSpread; evs: PcStatSpread },
): { level: number; ivs: PcStatSpread; evs: PcStatSpread } {
  const clamp = (raw: string, min: number, max: number, def: number) => {
    const t = raw.trim();
    if (t === '') return def;
    const n = Math.round(Number(t));
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  };
  const ivs = { ...fallback.ivs };
  const evs = { ...fallback.evs };
  for (const k of STAT_ORDER) {
    ivs[k] = clamp(form.ivs[k], 0, 31, fallback.ivs[k]);
    evs[k] = clamp(form.evs[k], 0, 252, fallback.evs[k]);
  }
  return { level: clamp(form.level, 1, 100, fallback.level), ivs, evs };
}

export function evTotalFromForm(form: NumericFormFields): number {
  return STAT_ORDER.reduce((sum, k) => {
    const t = form.evs[k].trim();
    if (t === '') return sum;
    const n = Number(t);
    return sum + (Number.isFinite(n) ? Math.max(0, Math.min(252, Math.round(n))) : 0);
  }, 0);
}
