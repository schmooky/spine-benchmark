#!/usr/bin/env node
// Copies src/templates -> dist/templates after `tsc` finishes.
//
// Replaces `cp -r src/templates dist/templates` so the build works
// on Windows (where `cp -r` does not exist). Zero-dep: uses
// fs.cpSync which ships with Node 16.7+.

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const src = resolve(pkgRoot, 'src', 'templates');
const dest = resolve(pkgRoot, 'dist', 'templates');

if (!existsSync(src)) {
  console.error(`[reports-api] templates source missing at ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[reports-api] copied templates -> ${dest}`);
