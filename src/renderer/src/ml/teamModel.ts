/**
 * The team strength model: P(team A beats team B) from species and known
 * sets, and the meta score built on it (a team's mean win chance against
 * recent high-rated teams). Everything loads from data packs; null means the
 * model isn't downloaded, and callers fall back to Classic.
 */
import { loadJsonPack, runFeeds } from './runtime';

/** One Pokémon as the model sees it; anything unknown is left out. */
export interface TeamMon {
  species: string;
  /** Base species, for formes the replays only show by base name (Urshifu-*). */
  base?: string;
  item?: string | null;
  ability?: string | null;
  tera?: string | null;
  moves?: string[];
}

interface Vocab {
  slots: number;
  tokens: Record<string, number>;
}

interface MetaTeams {
  month: string;
  teams: { species: string[]; revealed: Record<string, { item?: string; ability?: string; tera?: string; moves?: string[] }> }[];
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const PAD = 0;
const UNK = 1;

/** Same tokens as ml/features/team.py: species, then item, ability, Tera type and up to four moves. */
export function monTokens(m: TeamMon): string[] {
  const out = [`s:${toId(m.species)}`];
  if (m.item) out.push(`i:${toId(m.item)}`);
  if (m.ability) out.push(`a:${toId(m.ability)}`);
  if (m.tera) out.push(`t:${toId(m.tera)}`);
  for (const mv of (m.moves ?? []).slice(0, 4)) out.push(`m:${toId(mv)}`);
  return out;
}

/** A team as `6 x slots` vocabulary indices; missing Pokémon are padding. */
export function encodeTeam(team: TeamMon[], vocab: Vocab): number[] {
  const out = new Array<number>(6 * vocab.slots).fill(PAD);
  team.slice(0, 6).forEach((m, i) => {
    monTokens(m)
      .slice(0, vocab.slots)
      .forEach((tok, j) => {
        const known = vocab.tokens[tok] ?? (j === 0 && m.base ? vocab.tokens[`s:${toId(m.base)}`] : undefined);
        out[i * vocab.slots + j] = known ?? (j === 0 ? UNK : PAD);
      });
  });
  return out;
}

export interface TeamScorer {
  /** Month the meta teams come from. */
  month: string;
  metaTeams: TeamMon[][];
  /** P(a beats b) for each pair. */
  winChances(pairs: [TeamMon[], TeamMon[]][]): Promise<number[] | null>;
  /**
   * Mean win chance of each team against the meta (or its first `sample`
   * teams, to keep a search fast).
   */
  metaScores(teams: TeamMon[][], sample?: number): Promise<number[] | null>;
}

export async function loadTeamScorer(format: string): Promise<TeamScorer | null> {
  const [vocab, meta] = await Promise.all([loadJsonPack<Vocab>(`team-vocab-${format}`), loadJsonPack<MetaTeams>(`meta-teams-${format}`)]);
  if (!vocab || !meta) return null;
  const name = `team-${format}`;
  const metaTeams: TeamMon[][] = meta.teams.map((t) =>
    t.species.map((species) => {
      const r = t.revealed[species] ?? {};
      return { species, item: r.item, ability: r.ability, tera: r.tera, moves: r.moves };
    }),
  );
  const width = 6 * vocab.slots;

  const winChances = async (pairs: [TeamMon[], TeamMon[]][]): Promise<number[] | null> => {
    if (!pairs.length) return [];
    const a = new BigInt64Array(pairs.length * width);
    const b = new BigInt64Array(pairs.length * width);
    pairs.forEach(([x, y], i) => {
      encodeTeam(x, vocab).forEach((v, j) => (a[i * width + j] = BigInt(v)));
      encodeTeam(y, vocab).forEach((v, j) => (b[i * width + j] = BigInt(v)));
    });
    // Equal ratings: the model scores the teams, not the players.
    const ratings = new Float32Array(pairs.length * 2);
    const dims = [pairs.length, 6, vocab.slots];
    const out = await runFeeds(name, { team_a: { data: a, dims }, team_b: { data: b, dims }, ratings: { data: ratings, dims: [pairs.length, 2] } }, 'win');
    return out ? Array.from(out) : null;
  };

  return {
    month: meta.month,
    metaTeams,
    winChances,
    async metaScores(teams, sample = metaTeams.length) {
      const opponents = metaTeams.slice(0, sample);
      const pairs = teams.flatMap((t) => opponents.map((o) => [t, o] as [TeamMon[], TeamMon[]]));
      const win = await winChances(pairs);
      if (!win) return null;
      return teams.map((_, i) => win.slice(i * opponents.length, (i + 1) * opponents.length).reduce((s, p) => s + p, 0) / opponents.length);
    },
  };
}
