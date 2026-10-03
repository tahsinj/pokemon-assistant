// Checks the writing rules in CONTRIBUTING.md: comments in code and CSS, the
// characters allowed in docs, and the decorative glyph in UI strings.
//
// Usage: node scripts/lint-prose.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Typographic characters that belong in neither comments nor docs.
const DOC_CHARS = /[\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u2190-\u21FF\u27F0-\u27FF]/g;

// Comments are plain ASCII, apart from accented letters such as the e in Pokemon.
const COMMENT_CHARS = /[^\p{ASCII}\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/gu;

const PROCESS_PHRASES = [
  /\bMVP\b/,
  /\blater phases?\b/i,
  /\bphase \d\b/i,
  /\boption [A-C]\b/,
  /\bfor now\b/i,
  /\bthe doc's\b/i,
  /\bpossible refinements\b/i,
  /\bsilence TS\b/i,
  /\b(product spec|design spec|per the spec)\b/i,
];

const FILLER_WORDS =
  /\b(robust|seamless(ly)?|leverag(e|es|ed|ing)|honest(ly)?|deliberate(ly)?|comprehensive|crucial|ensur(e|es|ed|ing))\b/gi;

const GLYPH = /\u25E2/g;

const CODE = /\.(ts|tsx|js|mjs|cjs)$/;
const CSS = /\.css$/;
const KOTLIN = /\.(kt|kts)$/;
const DOC = /\.md$/;

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('src/renderer/public/data/') && f !== 'package-lock.json');
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

/** Every comment in a JS/TS file as [start, end) offsets, found through the parser. */
export function codeComments(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const seen = new Map();
  const add = (ranges) => {
    for (const r of ranges ?? []) seen.set(r.pos, [r.pos, r.end]);
  };
  const visit = (node) => {
    const children = node.getChildren(source);
    children.forEach((child, i) => {
      if (child.kind === ts.SyntaxKind.JsxText) return;
      add(ts.getLeadingCommentRanges(text, child.pos));
      if (children[i + 1]?.kind !== ts.SyntaxKind.JsxText) {
        add(ts.getTrailingCommentRanges(text, child.end));
      }
      visit(child);
    });
  };
  visit(source);
  return [...seen.values()].sort((a, b) => a[0] - b[0]);
}

/** Block and line comments for CSS and Kotlin, which have no strings worth worrying about. */
export function simpleComments(file, text) {
  const pattern = CSS.test(file) ? /\/\*[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;
  return [...text.matchAll(pattern)].map((m) => [m.index, m.index + m[0].length]);
}

export function commentRanges(file, text) {
  if (CODE.test(file)) return codeComments(file, text);
  if (CSS.test(file) || KOTLIN.test(file)) return simpleComments(file, text);
  return [];
}

function lineCol(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return `${line}:${offset - before.lastIndexOf('\n')}`;
}

export function lintFile(file, text) {
  const problems = [];
  const report = (offset, message) => problems.push(`${file}:${lineCol(text, offset)} ${message}`);

  if (DOC.test(file)) {
    for (const m of text.matchAll(DOC_CHARS)) report(m.index, `use ASCII instead of "${m[0]}"`);
    return problems;
  }

  for (const m of text.matchAll(GLYPH)) report(m.index, 'decorative glyph');

  for (const [start, end] of commentRanges(file, text)) {
    const comment = text.slice(start, end);
    for (const m of comment.matchAll(COMMENT_CHARS)) {
      if (m[0] === '\u25E2') continue;
      report(start + m.index, `non-ASCII "${m[0]}" in comment`);
    }
    for (const phrase of PROCESS_PHRASES) {
      const m = comment.match(phrase);
      if (m) report(start + m.index, `process phrase "${m[0]}" in comment`);
    }
    for (const m of comment.matchAll(FILLER_WORDS)) {
      report(start + m.index, `filler word "${m[0]}" in comment`);
    }
  }
  return problems;
}

function main() {
  const files = trackedFiles().filter(
    (f) => CODE.test(f) || CSS.test(f) || KOTLIN.test(f) || DOC.test(f),
  );
  const problems = files.flatMap((f) => lintFile(f, readFileSync(f, 'utf8')));
  for (const p of problems) console.log(p);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s). Rules are in CONTRIBUTING.md.`);
    process.exit(1);
  }
  console.log(`lint:prose ok (${files.length} files)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
