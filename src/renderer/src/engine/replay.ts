/** Showdown replays: where to fetch them, and reading their logs from any of the shapes they come in. */

export interface Replay {
  format: string;
  players: { p1: string; p2: string };
  /** Spectator protocol lines. */
  lines: string[];
  /** turnStarts[n - 1] is the index of the `|turn|n` line. */
  turnStarts: number[];
}

/** The JSON URL for a replay page link ("https://replay.pokemonshowdown.com/gen9ou-123" or just "gen9ou-123"). */
export function replayJsonUrl(input: string): string | null {
  const m = /(?:replay\.pokemonshowdown\.com\/)?([a-z0-9]+-\d+(?:-[a-z0-9]+)?)(?:\.json|\.log)?(?:[?#].*)?$/i.exec(input.trim());
  return m ? `https://replay.pokemonshowdown.com/${m[1].toLowerCase()}.json` : null;
}

/** A replay's log from its JSON, its saved HTML page, or the raw log text. */
export function extractLog(text: string): string {
  const t = text.trim();
  if (t.startsWith('{')) {
    const data = JSON.parse(t) as { log?: string };
    if (!data.log) throw new Error('That JSON has no battle log.');
    return data.log;
  }
  const html = /<script[^>]*class="battle-log-data"[^>]*>([\s\S]*?)<\/script>/i.exec(t);
  if (html) return html[1].replace(/\\\//g, '/');
  return t;
}

export function parseReplay(text: string): Replay {
  const lines = extractLog(text)
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.startsWith('|'));
  if (!lines.some((l) => l.startsWith('|turn|'))) throw new Error('No battle turns found. Is this a Showdown replay or battle log?');
  const players = { p1: 'Player 1', p2: 'Player 2' };
  let format = '';
  const turnStarts: number[] = [];
  lines.forEach((l, i) => {
    const parts = l.split('|');
    if (parts[1] === 'player' && (parts[2] === 'p1' || parts[2] === 'p2') && parts[3]) players[parts[2]] = parts[3];
    if (parts[1] === 'tier') format = parts[2];
    if (parts[1] === 'turn') turnStarts.push(i);
  });
  return { format, players, lines, turnStarts };
}

/** Lines up to the start of turn `n` (turn 0 is team preview), or the whole battle when `n` is past the end. */
export function linesUpTo(replay: Replay, n: number): string[] {
  if (n >= replay.turnStarts.length + 1) return replay.lines;
  const end = n <= 0 ? replay.turnStarts[0] : replay.turnStarts[n - 1] + 1;
  return replay.lines.slice(0, end);
}
