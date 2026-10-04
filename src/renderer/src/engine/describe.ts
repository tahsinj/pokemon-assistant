/**
 * Protocol lines to short sentences for the battle log. Lines nobody needs
 * to read (timers, request bookkeeping) return null.
 */
const STATUS: Record<string, string> = {
  brn: 'was burned',
  par: 'is paralyzed',
  psn: 'was poisoned',
  tox: 'was badly poisoned',
  slp: 'fell asleep',
  frz: 'was frozen solid',
};

const STATS: Record<string, string> = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
  accuracy: 'accuracy',
  evasion: 'evasiveness',
};

const WEATHER: Record<string, string> = {
  RainDance: 'It started to rain.',
  SunnyDay: 'The sunlight turned harsh.',
  Sandstorm: 'A sandstorm kicked up.',
  Snowscape: 'It started to snow.',
  none: 'The weather cleared up.',
};

export interface Names {
  /** Display name per side, e.g. { p1: 'You', p2: 'Greedy' }. */
  p1: string;
  p2: string;
}

/** "p2a: Dondozo" -> "the opposing Dondozo" from p1's point of view. */
function mon(ident: string | undefined, viewer: 'p1' | 'p2' = 'p1'): string {
  if (!ident) return 'It';
  const [side, name] = ident.split(': ');
  const own = side?.startsWith(viewer);
  return own ? name ?? ident : `the opposing ${name ?? ident}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "45/100" or "250/319 par" -> "45%" for foes, "250/319 HP" for your own side. */
function hp(ident: string, condition: string): string {
  const [frac] = condition.split(' ');
  if (frac === '0') return 'fainted';
  const [cur, max] = frac.split('/').map(Number);
  if (!max) return frac;
  return ident.startsWith('p1') ? `${cur}/${max} HP` : `${Math.round((100 * cur) / max)}%`;
}

function effect(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/^(move|item|ability): /, '');
}

export function describeLine(line: string, names: Names): string | null {
  const parts = line.split('|').slice(1);
  const [kind, a, b, c] = parts;
  const from = parts.find((p) => p.startsWith('[from]'))?.slice('[from] '.length);
  switch (kind) {
    case 'turn':
      return `Turn ${a}`;
    case 'switch':
    case 'drag': {
      const side = a.startsWith('p1') ? names.p1 : names.p2;
      const species = b.split(',')[0];
      return a.startsWith('p1') && names.p1 === 'You' ? `You sent out ${species}.` : `${side} sent out ${species}.`;
    }
    case 'move':
      return `${cap(mon(a))} used ${b}.`;
    case '-damage':
      // A hit to 0 HP is followed by a faint line, which says it.
      return b.startsWith('0') ? null : `${cap(mon(a))} is down to ${hp(a, b)}${from ? ` (${effect(from)})` : ''}.`;
    case '-heal':
      return `${cap(mon(a))} recovered to ${hp(a, b)}${from ? ` (${effect(from)})` : ''}.`;
    case 'faint':
      return `${cap(mon(a))} fainted!`;
    case '-supereffective':
      return "It's super effective!";
    case '-resisted':
      return "It's not very effective.";
    case '-immune':
      return `It doesn't affect ${mon(a)}.`;
    case '-crit':
      return 'A critical hit!';
    case '-miss':
      return `${cap(mon(b ?? a))} avoided the attack.`;
    case '-fail':
      return 'But it failed!';
    case '-status':
      return `${cap(mon(a))} ${STATUS[b] ?? `got ${b}`}.`;
    case '-curestatus':
      return `${cap(mon(a))} is cured of its ${b}.`;
    case '-boost':
    case '-unboost': {
      const n = Number(c);
      const how = n >= 3 ? 'drastically ' : n === 2 ? 'sharply ' : '';
      return `${cap(mon(a))}'s ${STATS[b] ?? b} ${kind === '-boost' ? 'rose' : 'fell'} ${how}`.trim() + '.';
    }
    case '-weather':
      return parts.includes('[upkeep]') ? null : WEATHER[a] ?? null;
    case '-fieldstart':
      return `${effect(a)} started.`;
    case '-fieldend':
      return `${effect(a)} ended.`;
    case '-sidestart':
      return `${effect(b)} was set on ${a.startsWith('p1') ? 'your' : "the opponent's"} side.`;
    case '-sideend':
      return `${effect(b)} ended on ${a.startsWith('p1') ? 'your' : "the opponent's"} side.`;
    case '-terastallize':
      return `${cap(mon(a))} terastallized into the ${b} type!`;
    case '-enditem':
      return `${cap(mon(a))}'s ${b} was ${from ? `removed (${effect(from)})` : 'used up'}.`;
    case '-item':
      return `${cap(mon(a))} has ${b}.`;
    case '-ability':
      return `${cap(mon(a))}'s ${b}.`;
    case 'cant':
      return `${cap(mon(a))} can't move (${effect(b)}).`;
    case '-activate':
      return b ? `${cap(mon(a))}: ${effect(b)}.` : null;
    case 'win':
      return `${a === names.p1 && a === 'You' ? 'You' : a} won the battle!`;
    case 'tie':
      return 'The battle ended in a tie.';
    default:
      return null;
  }
}
