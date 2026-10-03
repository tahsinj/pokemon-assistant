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
import type { AssumedSet, OpponentBulk } from './opponentSet';
import { fromPcRecord, toCombatFields, type CombatImportInput } from './toCombatSpec';
import { calcAllMoves, type DamageOutcome } from './battle/damage';
import { EMPTY_FIELD, type BattlePokemonSpec } from './battle/types';
import { calcAllStats } from './stats';

export interface MatchupCell {
  verdict: 'win' | 'trade' | 'lose';
  label: string;            // OHKO | 2HKO | 3HKO | wall | lose
  sub: string;              // speed or bulk note: faster | slower | takes NN% | no KO
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

/**
 * Which ability to assume for the opponent given the assumption tier. The
 * realistic "Competitive" tab uses the most-used ability (still applies real
 * abilities like a Levitate mon's Levitate); the theoretical Min / Max-IV tabs
 * assume the most defensive ability it *could* run (worst case for the drafter).
 */
export function opponentAbility(p: Pokemon, setAbility: string | null, bulk: OpponentBulk): string | null {
  return bulk === 'competitive' ? setAbility : defensiveAbility(p, setAbility);
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
  oppSide: { p: Pokemon; level: number; set: AssumedSet; teraType?: string | null; dynamax?: boolean; assumedAbility?: string | null },
  moves: Record<string, Move>,
): MatchupCell {
  return evaluateSpecMatchup(
    { p: pcSide.p, input: fromPcRecord(pcSide.rec) },
    {
      p: oppSide.p,
      input: oppSide.set.input,
      tera: oppSide.teraType,
      dynamax: oppSide.dynamax,
      // Tier-aware (set by the caller per assumption tab); direct callers fall
      // back to the conservative worst-case ability.
      ability:
        oppSide.assumedAbility !== undefined
          ? oppSide.assumedAbility
          : defensiveAbility(oppSide.p, oppSide.set.ability),
    },
    moves,
  );
}

/**
 * Lower-level 1v1 evaluator over two already-resolved combat inputs (species +
 * CombatImportInput), not tied to a PC record. `evaluateMatchup` is the thin
 * PC-vs-opponent wrapper over this; the Pokédex "should I send this in?" check
 * uses it directly with two assumed competitive sets. Verdict is from `mine`'s
 * perspective. Pure.
 */
export function evaluateSpecMatchup(
  mine: { p: Pokemon; input: CombatImportInput; tera?: string | null; ability?: string | null },
  opp: { p: Pokemon; input: CombatImportInput; tera?: string | null; dynamax?: boolean; ability?: string | null },
  moves: Record<string, Move>,
): MatchupCell {
  const myFallback = bestDamagingMoveNames(mine.p, moves);
  const oppFallback = bestDamagingMoveNames(opp.p, moves);

  const me = toBattleSpec(mine.input, mine.p, myFallback, { tera: mine.tera, ability: mine.ability });
  const them = toBattleSpec(opp.input, opp.p, oppFallback, {
    tera: opp.tera,
    dynamax: opp.dynamax,
    ability: opp.ability,
  });

  const myBest = bestDamaging(calcAllMoves(9, me.spec, them.spec, EMPTY_FIELD));
  const theirBest = bestDamaging(calcAllMoves(9, them.spec, me.spec, EMPTY_FIELD));

  const mySpe = speedOf(mine.p, me.fields);
  const theirSpe = speedOf(opp.p, them.fields);
  const iAmFaster = mySpe > theirSpe;

  const myKoChance = myBest?.ko.chance ?? 0;
  const theirPctMax = theirBest?.pctMax ?? 0;
  const myPctMax = myBest?.pctMax ?? 0;

  // Turns each side needs to KO the other (inf = can't KO at >=50% reliability).
  const realKo = (o: DamageOutcome | null) => (o && o.ko.n > 0 && o.ko.chance >= 0.5 ? o.ko.n : Infinity);
  const r = classifyRace({ myKoN: realKo(myBest), theirKoN: realKo(theirBest), iAmFaster, myPctMax, theirPctMax });

  return { ...r, iAmFaster, myKoChance, theirPctMax, moveName: myBest?.moveName ?? null };
}

export interface RaceInputs {
  /** Turns I need to KO them (Infinity = can't). */
  myKoN: number;
  /** Turns they need to KO me (Infinity = can't). */
  theirKoN: number;
  iAmFaster: boolean;
  /** My best move as % of their HP, and theirs as % of mine. */
  myPctMax: number;
  theirPctMax: number;
}

/**
 * Resolve a 1v1 as a speed race. The key correctness point: a "faster 2HKO" is
 * only a win when the mon survives the opponent's hit in between - a faster mon
 * lands its KO before the opponent acts that turn (so it wins ties), a slower
 * mon must KO strictly sooner. Pure / unit-tested.
 */
export function classifyRace({ myKoN, theirKoN, iAmFaster, myPctMax, theirPctMax }: RaceInputs): {
  verdict: MatchupCell['verdict']; label: string; sub: string; score: number;
} {
  const iCanKo = myKoN !== Infinity;
  const theyCanKo = theirKoN !== Infinity;
  const iWinRace = iCanKo && (iAmFaster ? myKoN <= theirKoN : myKoN < theirKoN);
  const koLabel = (n: number) => (n === 1 ? 'OHKO' : `${n}HKO`);

  let verdict: MatchupCell['verdict'];
  let label: string;
  let sub: string;

  if (iWinRace) {
    verdict = 'win';
    label = myKoN >= 3 ? 'wall' : koLabel(myKoN);
    sub = myKoN >= 3 ? `takes ${Math.round(theirPctMax)}%`
      : iAmFaster ? '↑ faster' : '↓ survives';
  } else if (iCanKo && (myKoN <= theirKoN || myPctMax >= 50)) {
    // Lose the speed race but KO in comparable turns or chunk them >=50% before
    // going down - a genuine trade / check, not a clean answer.
    verdict = 'trade';
    label = koLabel(myKoN);
    sub = iAmFaster ? 'KO’d first' : 'slower';
  } else if (!theyCanKo && myPctMax >= 20) {
    // Can't cleanly KO them, but they can't KO me either and I chip - a stall.
    verdict = 'trade';
    label = 'wall';
    sub = `takes ${Math.round(theirPctMax)}% · no KO`;
  } else {
    verdict = 'lose';
    label = 'lose';
    sub = iCanKo ? 'too slow' : 'no KO';
  }

  const score =
    (iWinRace ? (myKoN === 1 ? 100 : myKoN === 2 ? 65 : 35) : 0) +
    (verdict === 'trade' ? 25 : 0) +
    (iAmFaster ? 15 : 0) +
    (100 - theirPctMax) * 0.35 -
    (verdict === 'lose' ? 50 : 0);

  return { verdict, label, sub, score };
}
