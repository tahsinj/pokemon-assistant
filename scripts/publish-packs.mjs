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

mkdirSync(OUT, { recursive: true });
const packs = [];
for (const format of readdirSync(MODELS)) {
  const model = path.join(MODELS, format, 'matchup.onnx');
  const metrics = path.join(MODELS, format, 'metrics.json');
  if (!existsSync(model) || !existsSync(metrics)) continue;
  const bytes = readFileSync(model);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // The version is the training date plus a hash prefix, so a retrain gets a new file name.
  const version = `${JSON.parse(readFileSync(metrics, 'utf8')).trained}-${sha256.slice(0, 8)}`;
  const file = `matchup-${format}-${version}.onnx`;
  copyFileSync(model, path.join(OUT, file));
  packs.push({ name: `matchup-${format}`, kind: 'model', format, version, file, size: bytes.length, sha256 });
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
