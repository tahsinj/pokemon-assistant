/**
 * Evaluate one PC mon vs one opponent mon with the real @smogon/calc engine
 * (OHKO probability + speed + real movesets), and classify the matchup as a
 * win / trade / lose per the Counter Draft "answer" rule:
 *   answer = (outspeed AND KO within 2)  OR  (survive its best hit AND KO back)
 *            OR (wall: take <=45% and KO within 3).
 * All damage flows through lib/battle/damage.ts. Pure - tested in matchup.test.ts.
 */
import type { Pokemon, Move, BaseStats } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { AssumedSet } from './opponentSet';
import { fromPcRecord, toCombatFields, type CombatImportInput } from './toCombatSpec';
import { calcAllMoves, type DamageOutcome } from './battle/damage';
import { EMPTY_FIELD, type BattlePokemonSpec } from './battle/types';
import { calcAllStats } from './stats';

export interface MatchupCell {
  verdict: 'win' | 'trade' | 'lose';
  label: string;            // OHKO | 2HKO | 3HKO | wall | lose
  sub: string;              // ↑ faster | slower | takes NN% | no KO
  iAmFaster: boolean;
  myKoChance: number;       // 0..1, best move
  theirPctMax: number;      // % of my HP their best move deals
  moveName: string | null;  // the PC mon's best damaging move (null = no damage)
  score: number;            // signed; higher favors the PC mon
}

function bestDamaging(outcomes: DamageOutcome[]): DamageOutcome | null {
  const dmg = outcomes.filter((o) => !o.isZero);
  if (!dmg.length) return null;
  return dmg.sort((a, b) => (b.ko.chance - a.ko.chance) || (b.pctMax - a.pctMax))[0];
}

function kosWithin(o: DamageOutcome | null, n: number): boolean {
  return !!o && o.ko.n > 0 && o.ko.n <= n && o.ko.chance >= 0.5;
}

// Abilities that change the OHKO/immunity verdict. For a counter-draft we
// assume the opponent's most defensive plausible ability (worst case for us):
// an immunity ability beats relying on that move type; an OHKO-denier means no
// clean one-shot. Keyed by normalized id.
const IMMUNITY_ABILITIES = new Set([
  'levitate', 'flashfire', 'waterabsorb', 'voltabsorb', 'lightningrod', 'stormdrain',
  'sapsipper', 'motordrive', 'dryskin', 'eartheater', 'wellbakedbody', 'voltabsorb',
]);
const DENY_OHKO_ABILITIES = new Set(['sturdy', 'multiscale', 'shadowshield', 'disguise', 'iceface']);
const normAbil = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The opponent's most defensively-significant ability from its pool, else the assumed one. */
function defensiveAbility(p: Pokemon, fallback: string | null): string | null {
  const pool = [...p.abilities, ...(p.hiddenAbilities ?? [])].map(normAbil);
  const imm = pool.find((a) => IMMUNITY_ABILITIES.has(a));
  if (imm) return imm;
  const deny = pool.find((a) => DENY_OHKO_ABILITIES.has(a));
  if (deny) return deny;
  return fallback;
}

function toBattleSpec(
  input: CombatImportInput,
  species: Pokemon,
  fallbackMoves: string[],
  opts?: { tera?: string | null; dynamax?: boolean; ability?: string | null },
): { spec: BattlePokemonSpec; fields: ReturnType<typeof toCombatFields> } {
  const fields = toCombatFields(input, species, fallbackMoves);
  const spec: BattlePokemonSpec = {
    speciesName: fields.speciesName,
    level: fields.level,
    nature: fields.nature,
    ability: (opts?.ability ?? fields.ability) || undefined,
    item: fields.item || undefined,
    ivs: fields.ivs,
    evs: fields.evs,
    moves: fields.moves.filter(Boolean).map((name) => ({ name })),
  };
  if (opts?.tera) {
    spec.isTerastallized = true;
    spec.teraType = opts.tera;
  }
  if (opts?.dynamax) spec.isDynamaxed = true;
  return { spec, fields };
}

function bestDamagingMoveNames(p: Pokemon, moves: Record<string, Move>): string[] {
  return p.moves
    .map((lm) => moves[lm.move])
    .filter((m): m is Move => !!m && (m.power ?? 0) > 0)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
    .slice(0, 4)
    .map((m) => m.name);
}

function speedOf(species: Pokemon, fields: ReturnType<typeof toCombatFields>): number {
  const stats: BaseStats = calcAllStats(species.baseStats, fields.ivs, fields.evs, fields.level, fields.nature);
  return fields.item === 'Choice Scarf' ? Math.floor(stats.spe * 1.5) : stats.spe;
}

export function evaluateMatchup(
  pcSide: { rec: PcPokemonRecord; p: Pokemon },
  oppSide: { p: Pokemon; level: number; set: AssumedSet; teraType?: string | null; dynamax?: boolean },
  moves: Record<string, Move>,
): MatchupCell {
  const myFallback = bestDamagingMoveNames(pcSide.p, moves);
  const oppFallback = bestDamagingMoveNames(oppSide.p, moves);

  const me = toBattleSpec(fromPcRecord(pcSide.rec), pcSide.p, myFallback);
  const opp = toBattleSpec(oppSide.set.input, oppSide.p, oppFallback, {
    tera: oppSide.teraType,
    dynamax: oppSide.dynamax,
    // Assume the opponent's most defensive ability (Levitate immunity, Sturdy,
    // …) so the draft doesn't over-promise a KO it can't guarantee.
    ability: defensiveAbility(oppSide.p, oppSide.set.ability),
  });

  const myBest = bestDamaging(calcAllMoves(9, me.spec, opp.spec, EMPTY_FIELD));
  const theirBest = bestDamaging(calcAllMoves(9, opp.spec, me.spec, EMPTY_FIELD));

  const mySpe = speedOf(pcSide.p, me.fields);
  const theirSpe = speedOf(oppSide.p, opp.fields);
  const iAmFaster = mySpe > theirSpe;

  const myKoChance = myBest?.ko.chance ?? 0;
  const theirPctMax = theirBest?.pctMax ?? 0;
  const ohko = !!myBest && myBest.ko.n === 1 && myBest.ko.chance >= 0.5;
  const ko2 = kosWithin(myBest, 2);
  const ko3 = kosWithin(myBest, 3);
  const survives = theirPctMax <= 45;

  let verdict: MatchupCell['verdict'];
  let label: string;
  let sub: string;

  if (iAmFaster && ohko) { verdict = 'win'; label = 'OHKO'; sub = '↑ faster'; }
  else if (iAmFaster && ko2) { verdict = 'win'; label = '2HKO'; sub = '↑ faster'; }
  else if (survives && ko3) { verdict = 'win'; label = 'wall'; sub = `takes ${Math.round(theirPctMax)}%`; }
  else if (ko2) { verdict = 'trade'; label = ohko ? 'OHKO' : '2HKO'; sub = iAmFaster ? '↑' : 'slower'; }
  else if (ko3 && theirPctMax <= 75) { verdict = 'trade'; label = '3HKO'; sub = 'pressures'; }
  else { verdict = 'lose'; label = 'lose'; sub = iAmFaster ? 'no KO' : 'slower'; }

  const score =
    (ohko ? 100 : 0) + (ko2 ? 60 : 0) + (ko3 ? 30 : 0) +
    (iAmFaster ? 20 : 0) + (100 - theirPctMax) * 0.4 -
    (verdict === 'lose' ? 50 : 0);

  return { verdict, label, sub, iAmFaster, myKoChance, theirPctMax, moveName: myBest?.moveName ?? null, score };
}
