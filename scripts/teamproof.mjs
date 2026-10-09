// Builds tools/teamproof for Node and runs it. Arguments pass through; see tools/teamproof/src/main.ts.
import { build } from 'esbuild';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outdir = path.resolve('node_modules/.cache/stablab/teamproof');
await build({
  entryPoints: { main: 'tools/teamproof/src/main.ts', worker: 'tools/teamproof/src/worker.ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir,
  outExtension: { '.js': '.mjs' },
  packages: 'external',
  logLevel: 'error',
});
const { run } = await import(pathToFileURL(path.join(outdir, 'main.mjs')).href);
await run(process.argv.slice(2), path.join(outdir, 'worker.mjs'));
