// Plays the bots against each other and writes docs/bot-elo.md.
//
// Usage: node scripts/bots-gauntlet.mjs [--games 100] [--ci]
//   --ci  fewer games, no file written, exit 1 if a level fails to beat the one below it
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const ci = args.includes('--ci');
const gi = args.indexOf('--games');
const games = gi >= 0 ? Number(args[gi + 1]) : ci ? 40 : 100;

// Bundle the TypeScript engine for Node; packages stay external and resolve from node_modules.
const out = path.resolve('node_modules/.cache/stablab/gauntlet.mjs');
fs.mkdirSync(path.dirname(out), { recursive: true });
await build({
  entryPoints: ['src/renderer/src/engine/bots/gauntlet.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  packages: 'external',
  logLevel: 'error',
});
const g = await import(pathToFileURL(out).href);

const results = g.runGauntlet(games, (line) => console.log(line));
for (const e of g.eloTable(results)) console.log(`${e.name}: ${e.elo}`);

if (ci) {
  const failed = results.filter((r) => (r.a === 'Greedy' && r.b === 'Random') || (r.a === 'Search' && r.b === 'Greedy')).filter((r) => r.score / r.games <= 0.5);
  for (const r of failed) console.error(`${r.a} no longer beats ${r.b}: ${r.score}/${r.games}`);
  process.exit(failed.length ? 1 : 0);
}

fs.writeFileSync('docs/bot-elo.md', g.markdown(results, new Date().toISOString().slice(0, 10)));
console.log('Wrote docs/bot-elo.md');
