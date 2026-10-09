/** The team model from data packs; null when it isn't downloaded, and callers fall back to Classic. */
import { loadJsonPack, runFeeds } from './runtime';
import { makeTeamScorer, type MetaTeams, type TeamScorer, type Vocab } from './teamModel';

export async function loadTeamScorer(format: string): Promise<TeamScorer | null> {
  const [vocab, meta] = await Promise.all([loadJsonPack<Vocab>(`team-vocab-${format}`), loadJsonPack<MetaTeams>(`meta-teams-${format}`)]);
  if (!vocab || !meta) return null;
  return makeTeamScorer(vocab, meta, (feeds) => runFeeds(`team-${format}`, feeds, 'win'));
}
