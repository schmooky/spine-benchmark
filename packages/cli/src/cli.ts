#!/usr/bin/env node
/**
 * spine-benchmark CLI
 *
 * Usage:
 *   spine-benchmark analyze <skeleton.json|.skel> <atlas> [options]
 *
 * Options:
 *   --format=pretty   Colored terminal output with tables (default)
 *   --format=json     Structured JSON for programmatic consumption
 *   --format=flat     One key=value per line for grep/awk/pipe
 *   --no-color        Disable ANSI colors (auto-disabled when piping)
 *   -h, --help        Show this help
 *   -v, --version     Show version
 *
 * Examples:
 *   spine-benchmark analyze spineboy.json spineboy.atlas
 *   spine-benchmark analyze hero.skel hero.atlas --format=json
 *   spine-benchmark analyze hero.skel hero.atlas --format=flat | grep "worst"
 *   spine-benchmark analyze hero.skel hero.atlas --format=json | jq '.worstRI'
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSkeleton } from './loader.js';
import { analyzeSkeletonData } from './analyze.js';
import { formatPretty, formatJson, formatFlat } from './format.js';

type Format = 'pretty' | 'json' | 'flat';

function getVersion(): string {
  try {
    const dir = fileURLToPath(new URL('..', import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const HELP = `
spine-benchmark - Spine animation performance analyzer

Usage:
  spine-benchmark analyze <skeleton> <atlas> [options]

Arguments:
  <skeleton>    Path to .json or .skel skeleton file
  <atlas>       Path to .atlas file

Options:
  --format=pretty   Colored terminal output with tables (default)
  --format=json     Structured JSON for programmatic consumption
  --format=flat     One key=value per line for grep/awk/pipe
  --no-color        Disable ANSI colors (auto-disabled when piping)
  -h, --help        Show this help
  -v, --version     Show version

Examples:
  spine-benchmark analyze spineboy.json spineboy.atlas
  spine-benchmark analyze hero.skel hero.atlas --format=json
  spine-benchmark analyze hero.skel hero.atlas --format=flat | grep "worst"
`.trim();

function parseArgs(argv: string[]): {
  command: string;
  skeletonPath: string;
  atlasPath: string;
  format: Format;
  noColor: boolean;
  help: boolean;
  version: boolean;
} {
  const result = {
    command: '',
    skeletonPath: '',
    atlasPath: '',
    format: 'pretty' as Format,
    noColor: false,
    help: false,
    version: false,
  };

  const positional: string[] = [];

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg === '--no-color') {
      result.noColor = true;
    } else if (arg.startsWith('--format=')) {
      const fmt = arg.slice('--format='.length);
      if (fmt === 'pretty' || fmt === 'json' || fmt === 'flat') {
        result.format = fmt;
      } else {
        console.error(`Unknown format: ${fmt}. Use pretty, json, or flat.`);
        process.exit(1);
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  result.command = positional[0] || '';
  result.skeletonPath = positional[1] || '';
  result.atlasPath = positional[2] || '';

  return result;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.version) {
    console.log(getVersion());
    process.exit(0);
  }

  // Auto-disable color when piping
  if (args.noColor || !process.stdout.isTTY) {
    // Strip ANSI by switching to flat when piping without explicit format
    if (!process.argv.includes('--format=pretty') && !process.stdout.isTTY) {
      // If user explicitly asked for pretty, respect it. Otherwise auto-flat.
      if (args.format === 'pretty' && !process.argv.some(a => a.startsWith('--format='))) {
        args.format = 'flat';
      }
    }
  }

  if (args.command !== 'analyze') {
    if (args.command) {
      console.error(`Unknown command: ${args.command}`);
    } else {
      console.error('No command specified.');
    }
    console.error('Run `spine-benchmark --help` for usage.');
    process.exit(1);
  }

  if (!args.skeletonPath || !args.atlasPath) {
    console.error('Missing required arguments: <skeleton> <atlas>');
    console.error('Run `spine-benchmark --help` for usage.');
    process.exit(1);
  }

  const skeletonPath = resolve(args.skeletonPath);
  const atlasPath = resolve(args.atlasPath);

  try {
    const { skeletonData } = loadSkeleton(skeletonPath, atlasPath);
    const report = analyzeSkeletonData(skeletonData);

    switch (args.format) {
      case 'pretty':
        console.log(formatPretty(report));
        break;
      case 'json':
        console.log(formatJson(report));
        break;
      case 'flat':
        console.log(formatFlat(report));
        break;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
