// Reports CSS that can never apply: selectors naming a class no renderer file
// uses, and keyframes no animation refers to. Classes built at runtime from a
// prefix (`type-${t}`) are listed in DYNAMIC_PREFIXES.
//
// Usage: node scripts/lint-css.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';

const STYLESHEET = 'src/renderer/src/styles.css';
const SOURCE_DIR = 'src/renderer/src';
const DYNAMIC_PREFIXES = ['gender-icon-', 'type-'];

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [path] : [];
  });
}

const source = [...sourceFiles(SOURCE_DIR), 'src/renderer/index.html'].map((f) => readFileSync(f, 'utf8')).join('\n');
const words = new Set(source.match(/[A-Za-z_][\w-]*/g));
const used = (cls) => words.has(cls) || DYNAMIC_PREFIXES.some((p) => cls.startsWith(p));

// Classes a selector needs on the page. Ones inside :not() need not exist.
function requiredClasses(selector) {
  const bare = selector.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, '');
  return [...bare.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\/g, ''));
}

const root = postcss.parse(readFileSync(STYLESHEET, 'utf8'), { from: STYLESHEET });
const problems = [];
const animations = new Set();
root.walkDecls(/^animation(-name)?$/, (d) => d.value.match(/[A-Za-z_][\w-]*/g)?.forEach((w) => animations.add(w)));

root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
  for (const selector of rule.selectors) {
    const missing = requiredClasses(selector).filter((c) => !used(c));
    if (missing.length) problems.push(`${STYLESHEET}:${rule.source.start.line}: "${selector}" needs unused .${missing.join(', .')}`);
  }
});
root.walkAtRules(/keyframes$/, (at) => {
  if (!animations.has(at.params) && !words.has(at.params)) {
    problems.push(`${STYLESHEET}:${at.source.start.line}: keyframes "${at.params}" are never used`);
  }
});

for (const p of problems) console.error(p);
if (problems.length) {
  console.error(`\n${problems.length} unused CSS rule(s). Delete them, or add a runtime prefix to DYNAMIC_PREFIXES.`);
  process.exit(1);
}
console.log('lint-css: clean');
