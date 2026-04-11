/**
 * Output formatters for the CLI analysis report.
 *
 * Three modes:
 *   pretty - colored terminal output with tables and badges
 *   json   - structured JSON for programmatic consumption
 *   flat   - one key=value per line, easy to grep/awk/pipe
 */
import type { AnalysisReport, AnimationReport } from './analyze.js';
import type { ImpactLevel } from '@spine-benchmark/metrics-impact-formula';

// ── ANSI color helpers ──────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const WHITE = '\x1b[37m';

function levelColor(level: ImpactLevel): string {
  switch (level) {
    case 'minimal': return GREEN;
    case 'low': return GREEN;
    case 'moderate': return YELLOW;
    case 'high': return RED;
    case 'very-high': return `${BOLD}${RED}`;
  }
}

function levelBadge(level: ImpactLevel): string {
  const col = levelColor(level);
  return `${col}${level.toUpperCase().padEnd(10)}${RESET}`;
}

function bar(value: number, max: number, width = 20): string {
  const filled = Math.min(Math.round((value / Math.max(max, 1)) * width), width);
  return `${GREEN}${'#'.repeat(filled)}${DIM}${'.'.repeat(width - filled)}${RESET}`;
}

// ── Pretty ──────────────────────────────────────────────────────

export function formatPretty(report: AnalysisReport): string {
  const lines: string[] = [];
  const hr = `${DIM}${'─'.repeat(72)}${RESET}`;

  lines.push('');
  lines.push(`${BOLD}${CYAN}  SPINE BENCHMARK${RESET}  ${report.skeletonName}`);
  lines.push(hr);
  lines.push(`  ${DIM}Spine version${RESET}  ${report.spineVersion}`);
  lines.push(`  ${DIM}Bones${RESET}          ${report.totalBones}`);
  lines.push(`  ${DIM}Slots${RESET}          ${report.totalSlots}`);
  lines.push(`  ${DIM}Animations${RESET}     ${report.totalAnimations}`);
  lines.push(`  ${DIM}Skins${RESET}          ${report.totalSkins}`);
  lines.push('');

  // Worst-case badges
  lines.push(`  ${DIM}Worst RI${RESET}  ${levelBadge(report.worstRI.level)} ${report.worstRI.cost.toFixed(2).padStart(7)} (${report.worstRI.animation})`);
  lines.push(`  ${DIM}Worst CI${RESET}  ${levelBadge(report.worstCI.level)} ${report.worstCI.cost.toFixed(2).padStart(7)} (${report.worstCI.animation})`);
  lines.push('');
  lines.push(hr);

  // Per-animation table
  const maxTotal = Math.max(...report.animations.map(a => a.total), 1);
  lines.push(`  ${BOLD}${WHITE}Animation${RESET}${''.padEnd(25)}${BOLD}RI${RESET}      ${BOLD}CI${RESET}      ${BOLD}Total${RESET}    ${BOLD}Level${RESET}`);
  lines.push(hr);

  for (const anim of report.animations) {
    const name = anim.name.length > 30 ? anim.name.slice(0, 27) + '...' : anim.name;
    const riStr = anim.ri.toFixed(1).padStart(6);
    const ciStr = anim.ci.toFixed(1).padStart(6);
    const totalStr = anim.total.toFixed(1).padStart(6);
    const chart = bar(anim.total, maxTotal, 12);
    lines.push(`  ${name.padEnd(34)} ${riStr}  ${ciStr}  ${totalStr}  ${chart} ${levelBadge(anim.totalLevel)}`);
  }

  lines.push(hr);
  lines.push('');
  return lines.join('\n');
}

// ── JSON ────────────────────────────────────────────────────────

export function formatJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2);
}

// ── Flat (one key=value per line, pipe-friendly) ────────────────

export function formatFlat(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push(`skeleton.name=${report.skeletonName}`);
  lines.push(`skeleton.spineVersion=${report.spineVersion}`);
  lines.push(`skeleton.bones=${report.totalBones}`);
  lines.push(`skeleton.slots=${report.totalSlots}`);
  lines.push(`skeleton.animations=${report.totalAnimations}`);
  lines.push(`skeleton.skins=${report.totalSkins}`);
  lines.push(`worst.ri.animation=${report.worstRI.animation}`);
  lines.push(`worst.ri.cost=${report.worstRI.cost}`);
  lines.push(`worst.ri.level=${report.worstRI.level}`);
  lines.push(`worst.ci.animation=${report.worstCI.animation}`);
  lines.push(`worst.ci.cost=${report.worstCI.cost}`);
  lines.push(`worst.ci.level=${report.worstCI.level}`);

  for (const anim of report.animations) {
    const p = `animation.${anim.name}`;
    lines.push(`${p}.duration=${anim.duration}`);
    lines.push(`${p}.ri=${anim.ri}`);
    lines.push(`${p}.ci=${anim.ci}`);
    lines.push(`${p}.total=${anim.total}`);
    lines.push(`${p}.level=${anim.totalLevel}`);
    lines.push(`${p}.peakVertices=${anim.peakVertices}`);
    lines.push(`${p}.peakBlendModes=${anim.peakNonNormalBlends}`);
    lines.push(`${p}.peakClippingMasks=${anim.peakClippingMasks}`);
    lines.push(`${p}.peakConstraints=${anim.peakActiveConstraints}`);
    lines.push(`${p}.peakMeshes=${anim.peakMeshes}`);
  }

  return lines.join('\n');
}
