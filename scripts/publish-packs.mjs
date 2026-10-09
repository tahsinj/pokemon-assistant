// Builds packs.json from the trained models in ml/data/models and, with
// --publish, uploads both to the rolling "packs" release on GitHub, where the
// app downloads them (src/main/packs.ts).
//
// Usage: node scripts/publish-packs.mjs [--publish]
// Without --publish it only writes ml/data/packs/ and prints what it would upload.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const MODELS = 'ml/data/models';
const OUT = 'ml/data/packs';
const TAG = 'packs';
const publish = process.argv.includes('--publish');

// Pack name prefix, the file the trainer writes, and the metrics file that dates it.
const KINDS = [
  { prefix: 'matchup', file: 'matchup.onnx', metrics: 'metrics.json' },
  { prefix: 'team', file: 'team.onnx', metrics: 'team-metrics.json' },
  { prefix: 'team-vocab', file: 'team-vocab.json', metrics: 'team-metrics.json' },
  { prefix: 'meta-teams', file: 'meta-teams.json', metrics: 'team-metrics.json' },
];

mkdirSync(OUT, { recursive: true });
const packs = [];
for (const format of readdirSync(MODELS)) {
  for (const kind of KINDS) {
    const source = path.join(MODELS, format, kind.file);
    const metrics = path.join(MODELS, format, kind.metrics);
    if (!existsSync(source) || !existsSync(metrics)) continue;
    const bytes = readFileSync(source);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // The version is the training date plus a hash prefix, so a retrain gets a new file name.
    const version = `${JSON.parse(readFileSync(metrics, 'utf8')).trained}-${sha256.slice(0, 8)}`;
    const file = `${kind.prefix}-${format}-${version}${path.extname(kind.file)}`;
    copyFileSync(source, path.join(OUT, file));
    packs.push({ name: `${kind.prefix}-${format}`, kind: 'model', format, version, file, size: bytes.length, sha256 });
  }
}
if (!packs.length) {
  console.error(`No trained models under ${MODELS}; run ml/train first.`);
  process.exit(1);
}
const manifest = { generated: new Date().toISOString(), packs };
writeFileSync(path.join(OUT, 'packs.json'), JSON.stringify(manifest, null, 2));
const files = ['packs.json', ...packs.map((p) => p.file)].map((f) => path.join(OUT, f));
for (const p of packs) console.log(`${p.name} ${p.version} (${(p.size / 1024).toFixed(0)} KB)`);

if (!publish) {
  console.log(`Dry run: would upload ${files.length} files to release "${TAG}". Add --publish to upload.`);
  process.exit(0);
}
const gh = (...args) => execFileSync('gh', args, { stdio: 'inherit' });
try {
  execFileSync('gh', ['release', 'view', TAG], { stdio: 'ignore' });
} catch {
  gh('release', 'create', TAG, '--title', 'Data packs', '--notes', 'Trained models and data the app downloads. Updated in place; see packs.json.', '--latest=false');
}
gh('release', 'upload', TAG, ...files, '--clobber');
console.log(`Uploaded ${files.length} files to release "${TAG}".`);
