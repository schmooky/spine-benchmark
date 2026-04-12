/**
 * Output formatters for the watcher analysis report.
 * Mirrors packages/cli/src/format.ts with the same visual style.
 */
import type { AnalysisReport } from './analyze.js';
import type { ImpactLevel } from '@spine-benchmark/metrics-impact-formula';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
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

export function formatPretty(report: AnalysisReport): string {
  const lines: string[] = [];
  const hr = `  ${DIM}${'─'.repeat(60)}${RESET}`;

  // Worst-case badges
  lines.push('');
  lines.push(`  ${DIM}Worst RI${RESET}  ${levelBadge(report.worstRI.level)} ${report.worstRI.cost.toFixed(2).padStart(7)} (${report.worstRI.animation})`);
  lines.push(`  ${DIM}Worst CI${RESET}  ${levelBadge(report.worstCI.level)} ${report.worstCI.cost.toFixed(2).padStart(7)} (${report.worstCI.animation})`);
  lines.push('');
  lines.push(`  ${DIM}Bones${RESET} ${String(report.totalBones).padStart(4)}  ${DIM}Slots${RESET} ${String(report.totalSlots).padStart(4)}  ${DIM}Anims${RESET} ${String(report.totalAnimations).padStart(4)}  ${DIM}Skins${RESET} ${String(report.totalSkins).padStart(4)}`);
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
  return lines.join('\n');
}
