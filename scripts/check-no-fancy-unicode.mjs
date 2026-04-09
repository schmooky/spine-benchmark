#!/usr/bin/env node
/**
 * check-no-fancy-unicode
 *
 * The repo's house style forbids "fancy" Unicode punctuation that drifts
 * into source / docs / locales when AI agents leave their default output
 * unfiltered. Specifically forbidden:
 *
 *   - em-dash      (U+2014, "—")
 *   - en-dash      (U+2013, "–")
 *   - all unicode arrows (U+2190..U+21FF, U+27F0..U+27FF, U+2900..U+297F)
 *
 * Use ASCII equivalents instead:
 *
 *   —  ->  -    (or " - " in prose, "--" between code sections)
 *   →  ->  ->
 *   ←  ->  <-
 *   ↔  ->  <->
 *   ⇒  ->  =>
 *
 * Run via `npm run check:no-fancy-unicode` (also wired into `npm test`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Source extensions that participate in the rule. Binary files are
// skipped automatically by walking only known text extensions.
const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.md', '.css', '.html', '.yml', '.yaml',
]);

// File-level allowlist. Should be empty in steady state. Add an entry only
// if a file genuinely needs the fancy character (e.g. third-party fixture).
const ALLOWLIST = new Set([
  // The script itself spells out the forbidden characters in its docs.
  'scripts/check-no-fancy-unicode.mjs',
  'AGENTS.md',
]);

const FORBIDDEN = /[\u2013\u2014\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/;
const FORBIDDEN_GLOBAL = /[\u2013\u2014\u2190-\u21FF\u27F0-\u27FF\u2900-\u297F]/g;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      if (entry.name === 'dist') continue;
      if (entry.name === '.git') continue;
      if (entry.name === 'coverage') continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = entry.name.slice(dot);
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      yield full;
    }
  }
}

async function main() {
  const offenders = [];

  for await (const file of walk(repoRoot)) {
    const rel = relative(repoRoot, file).split(sep).join('/');
    if (ALLOWLIST.has(rel)) continue;

    const text = await readFile(file, 'utf8');
    if (!FORBIDDEN.test(text)) continue;

    const lines = text.split('\n');
    const occurrences = [];
    lines.forEach((line, idx) => {
      const matches = line.match(FORBIDDEN_GLOBAL);
      if (matches) {
        for (const ch of matches) {
          occurrences.push({ line: idx + 1, char: ch, codepoint: ch.codePointAt(0) });
        }
      }
    });
    offenders.push({ rel, occurrences });
  }

  if (offenders.length === 0) {
    console.log('check-no-fancy-unicode: OK');
    process.exit(0);
  }

  console.error('check-no-fancy-unicode: forbidden characters detected');
  console.error('');
  for (const off of offenders) {
    console.error(`  ${off.rel}`);
    for (const occ of off.occurrences.slice(0, 8)) {
      console.error(`    line ${occ.line}: U+${occ.codepoint.toString(16).toUpperCase().padStart(4, '0')} '${occ.char}'`);
    }
    if (off.occurrences.length > 8) {
      console.error(`    ... and ${off.occurrences.length - 8} more`);
    }
  }
  console.error('');
  console.error('Replace with ASCII equivalents (em-dash -> -, arrows -> -> / <-).');
  console.error('See AGENTS.md for the house style rules.');
  process.exit(1);
}

main().catch((err) => {
  console.error('check-no-fancy-unicode: crashed');
  console.error(err);
  process.exit(2);
});
