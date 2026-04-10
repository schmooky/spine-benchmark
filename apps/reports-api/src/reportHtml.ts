/**
 * Server-side report rendering with Handlebars.
 *
 * The /report/:id route fetches data from S3, renders complete HTML via
 * Handlebars templates, and sends it as a fully-hydrated page. No
 * client-side JavaScript is needed to display the report - the page
 * appears complete on first paint and works even with JS disabled.
 */
import Handlebars from 'handlebars';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReport, getAnalysis } from './reports.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TMPL_DIR = join(__dirname, '..', 'src', 'templates');

// ── Load and compile templates ──────────────────────────────────

function loadTemplate(name: string): string {
  // Try src/ first (dev), then fall back to dist-relative (prod build)
  try {
    return readFileSync(join(TMPL_DIR, name), 'utf8');
  } catch {
    // In production the dist/ layout mirrors src/, templates are copied
    return readFileSync(join(__dirname, 'templates', name), 'utf8');
  }
}

// Register partials
const partialNames = [
  'styles', 'header', 'impactCards', 'hotspots', 'advisor',
  'animationCard', 'comparisonTable', 'fileHashes',
];
for (const name of partialNames) {
  Handlebars.registerPartial(name, loadTemplate(`partials/${name}.hbs`));
}

const reportTemplate = Handlebars.compile(loadTemplate('report.hbs'));
const expiredTemplate = Handlebars.compile(loadTemplate('expired.hbs'));

// ── Helpers ─────────────────────────────────────────────────────

const ADVISOR_INFO: Record<string, { title: string; desc: string }> = {
  'page-break-pressure': {
    title: 'Atlas Page Break Pressure',
    desc: 'Multiple atlas pages force texture rebinds during rendering. Each page switch flushes the GPU batch and starts a new draw call. Pack all attachments onto fewer atlas pages, or reorder slots so same-page regions are adjacent.',
  },
  'blend-switch-pressure': {
    title: 'Blend Mode Switching',
    desc: 'Non-normal blend modes (additive, multiply, screen) force batch breaks. Each switch changes GPU blend state and flushes pending geometry. Group same-blend-mode slots together in the draw order.',
  },
  'mesh-density-pressure': {
    title: 'High Mesh Vertex Density',
    desc: 'Large mesh vertex counts increase both GPU fill cost and CPU skinning time. Consider reducing mesh resolution, using fewer control points, or converting complex meshes to simpler region attachments where deformation is not needed.',
  },
  'constraint-pressure': {
    title: 'Constraint Processing Load',
    desc: 'Physics, IK, path, and transform constraints run every frame on the CPU. Physics constraints are the heaviest. Consider disabling constraints that are not visually important, or reducing the number of constrained bones.',
  },
  'stable-profile': {
    title: 'Stable Performance Profile',
    desc: 'No significant performance hotspots detected. The skeleton is well-optimized for real-time rendering.',
  },
};

Handlebars.registerHelper('fixed', (val: unknown, decimals: unknown) => {
  const n = typeof val === 'number' ? val : 0;
  const d = typeof decimals === 'number' ? decimals : 1;
  return n.toFixed(d);
});

Handlebars.registerHelper('formatDate', (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
});

Handlebars.registerHelper('fileSize', (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
});

Handlebars.registerHelper('advisorTitle', (id: string) => {
  return ADVISOR_INFO[id]?.title || id;
});

Handlebars.registerHelper('advisorDesc', (id: string) => {
  return ADVISOR_INFO[id]?.desc || '';
});

Handlebars.registerHelper('rowLevel', (anim: any) => {
  if (anim.rowTone === 'danger') return 'veryHigh';
  if (anim.rowTone === 'warning') return 'high';
  return anim.rendering?.level || 'minimal';
});

Handlebars.registerHelper('rowClass', (anim: any) => {
  if (anim.rowTone === 'danger') return 'row-danger';
  if (anim.rowTone === 'warning') return 'row-warning';
  return '';
});

Handlebars.registerHelper('gt', (a: number, b: number) => a > b);

Handlebars.registerHelper('gifUrl', (animName: string, gifMap: Record<string, string>) => {
  return gifMap?.[animName] || '';
});

Handlebars.registerHelper('allFeatures', (active: string[]) => {
  const all = ['physics', 'ik', 'clipping', 'blend'];
  return all.map(f => ({ name: f, on: (active || []).includes(f) }));
});

/**
 * Generates an inline SVG heatmap of per-frame RI/CI over the animation
 * timeline. Two stacked area charts: orange for RI, blue for CI.
 */
Handlebars.registerHelper('heatmapSvg', (animName: string, timelines: Record<string, Array<{ time: number; ri: number; ci: number }>>) => {
  const data = timelines?.[animName];
  if (!data || data.length < 2) return '';

  const W = 300;
  const H = 48;
  const PAD = 1;

  // Find max for scale
  const maxVal = Math.max(1, ...data.map(d => d.ri + d.ci));

  // Build RI area path (bottom)
  const riPoints: string[] = [];
  const ciPoints: string[] = []; // CI stacked on top of RI
  for (let i = 0; i < data.length; i++) {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const riH = (data[i].ri / maxVal) * (H - 4);
    const totalH = ((data[i].ri + data[i].ci) / maxVal) * (H - 4);
    riPoints.push(`${x.toFixed(1)},${(H - 2 - riH).toFixed(1)}`);
    ciPoints.push(`${x.toFixed(1)},${(H - 2 - totalH).toFixed(1)}`);
  }

  // Close paths along the bottom
  const baseline = `${(W - PAD).toFixed(1)},${H - 2} ${PAD},${H - 2}`;

  // Threshold lines
  const lines: string[] = [];
  const thresholds = [
    { val: 3, label: 'low', color: '#A3E63533' },
    { val: 8, label: 'mod', color: '#FBBF2433' },
    { val: 15, label: 'high', color: '#FB923C33' },
    { val: 25, label: 'vHigh', color: '#F8717133' },
  ];
  for (const t of thresholds) {
    if (t.val < maxVal) {
      const y = H - 2 - (t.val / maxVal) * (H - 4);
      lines.push(`<line x1="${PAD}" y1="${y.toFixed(1)}" x2="${W - PAD}" y2="${y.toFixed(1)}" stroke="${t.color}" stroke-width="1" stroke-dasharray="2,2"/>`);
    }
  }

  const svg = `<div class="heatmap">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">
      <rect width="${W}" height="${H}" fill="#0E1117" rx="3"/>
      ${lines.join('\n      ')}
      <polygon points="${ciPoints.join(' ')} ${baseline}" fill="#60A5FA" opacity="0.3"/>
      <polyline points="${ciPoints.join(' ')}" fill="none" stroke="#60A5FA" stroke-width="1.5" opacity="0.7"/>
      <polygon points="${riPoints.join(' ')} ${baseline}" fill="#FB923C" opacity="0.4"/>
      <polyline points="${riPoints.join(' ')}" fill="none" stroke="#FB923C" stroke-width="1.5" opacity="0.8"/>
    </svg>
    <div class="heatmap-labels">
      <span class="ri-label">RI</span>
      <span class="ci-label">CI</span>
      <span class="heatmap-max">max ${maxVal.toFixed(1)}</span>
    </div>
  </div>`;

  return new Handlebars.SafeString(svg);
});

Handlebars.registerHelper('riPercent', (anim: any) => {
  const ri = anim.rendering?.cost ?? 0;
  const ci = anim.computational?.cost ?? 0;
  const total = ri + ci;
  if (total === 0) return 50;
  return Math.round((ri / total) * 100);
});

Handlebars.registerHelper('ciPercent', (anim: any) => {
  const ri = anim.rendering?.cost ?? 0;
  const ci = anim.computational?.cost ?? 0;
  const total = ri + ci;
  if (total === 0) return 50;
  return Math.round((ci / total) * 100);
});

// ── Render function ─────────────────────────────────────────────

export async function renderReport(id: string): Promise<string> {
  const meta = await getReport(id);
  if (!meta) return expiredTemplate({});

  const analysis = await getAnalysis(id) as any;
  if (!analysis) return expiredTemplate({});

  // Build screenshot URLs (proxied through this server, same origin)
  const screenshotUrls = meta.screenshotKeys.map((_: string, i: number) =>
    `/api/reports/${id}/screenshot/${i}`
  );

  const mainScreenshot = screenshotUrls[0] || null;

  // Build GIF map: animation name -> screenshot URL
  const gifMap: Record<string, string> = {};
  const animNames = (meta as any).animationNames as string[] | undefined;
  if (animNames) {
    animNames.forEach((name: string, i: number) => {
      const gifIdx = i + 1; // index 0 is the main screenshot
      if (gifIdx < screenshotUrls.length) {
        gifMap[name] = screenshotUrls[gifIdx];
      }
    });
  }

  return reportTemplate({
    meta,
    analysis,
    mainScreenshot,
    gifMap,
    publicUrl: config.publicUrl,
  });
}

/**
 * Legacy sync entry point (for backward compat with server.ts import).
 * The new renderReport is async because it fetches from S3.
 */
export function buildReportHtml(_id: string): string {
  // This is no longer used - the route handler calls renderReport directly.
  // Kept as a stub to avoid breaking the import.
  return '<!DOCTYPE html><html><body>Loading...</body></html>';
}
