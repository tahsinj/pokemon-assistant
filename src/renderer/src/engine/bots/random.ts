/** Level 0: a uniformly random legal choice, the baseline every other bot must beat. */
import { isFainted, type BattleRequest } from '../types';

/** Seeded generator in [0, 1) (mulberry32), so random games replay exactly. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bench slots (1-based) a switch can go to. */
export function switchTargets(req: BattleRequest): number[] {
  return req.side.pokemon.flatMap((p, i) => (!p.active && !isFainted(p) ? [i + 1] : []));
}

/** Every legal choice for a singles request, or [] when there is nothing to choose. */
export function legalChoices(req: BattleRequest): string[] {
  if (req.wait) return [];
  if (req.teamPreview) return ['default'];
  const switches = switchTargets(req).map((n) => `switch ${n}`);
  if (req.forceSwitch?.[0]) return switches.length ? switches : ['pass'];
  const active = req.active?.[0];
  if (!active) return ['default'];
  const moves = active.moves.flatMap((m, i) => (m.disabled || m.pp === 0 ? [] : [`move ${i + 1}`]));
  const out = moves.length ? [...moves] : ['move 1'];
  if (active.canTerastallize) out.push(...moves.map((m) => `${m} terastallize`));
  if (!active.trapped && !active.maybeTrapped) out.push(...switches);
  return out;
}

export function randomChoice(req: BattleRequest, rand: () => number): string | null {
  const options = legalChoices(req);
  return options.length ? options[Math.floor(rand() * options.length)] : null;
}

export function randomBot(seed = Date.now()): import('./bot').Bot {
  const rand = seededRandom(seed);
  return { level: 0, name: 'Random', choose: (_engine, _side, req) => randomChoice(req, rand) ?? 'default' };
}
