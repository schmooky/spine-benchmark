import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { createReport, getReport, getAnalysis, getScreenshot, cleanupExpired } from './reports.js';
import type { FileHash, CreateReportInput } from './reports.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

// ── Health ──────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ── Create report ───────────────────────────────────────────────
//
// POST /api/reports
//   multipart/form-data:
//     analysis     - JSON string (the full analysis payload)
//     meta         - JSON string { skeletonName, spineVersion, worstRiLevel, worstCiLevel, totalAnimations, fileHashes[] }
//     screenshots  - up to 5 image files (png/webp/jpg)
//

app.post('/api/reports', upload.array('screenshots', 5), async (req, res) => {
  try {
    const analysisStr = req.body?.analysis;
    const metaStr = req.body?.meta;

    if (!analysisStr || !metaStr) {
      res.status(400).json({ error: 'Missing required fields: analysis, meta' });
      return;
    }

    let analysis: unknown;
    let meta: {
      skeletonName: string;
      spineVersion: string;
      worstRiLevel: string;
      worstCiLevel: string;
      totalAnimations: number;
      fileHashes: FileHash[];
    };

    try {
      analysis = JSON.parse(analysisStr);
      meta = JSON.parse(metaStr);
    } catch {
      res.status(400).json({ error: 'Invalid JSON in analysis or meta field' });
      return;
    }

    const input: CreateReportInput = {
      analysis,
      skeletonName: meta.skeletonName,
      spineVersion: meta.spineVersion,
      worstRiLevel: meta.worstRiLevel,
      worstCiLevel: meta.worstCiLevel,
      totalAnimations: meta.totalAnimations,
      fileHashes: meta.fileHashes || [],
    };

    const screenshots = ((req.files || []) as Express.Multer.File[]).map(f => ({
      buffer: f.buffer,
      mimetype: f.mimetype,
      originalname: f.originalname,
    }));

    const result = await createReport(input, screenshots);
    res.status(201).json(result);
  } catch (err) {
    console.error('[reports-api] create failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get report ──────────────────────────────────────────────────
//
// GET /api/reports/:id
//   Returns report metadata + pre-signed URLs for analysis + screenshots.
//

app.get('/api/reports/:id', async (req, res) => {
  try {
    const meta = await getReport(req.params.id);
    if (!meta) {
      res.status(404).json({ error: 'Report not found or expired' });
      return;
    }
    // Return meta + proxy URLs (same origin, no CORS issues)
    res.json({
      meta,
      analysisUrl: `/api/reports/${meta.id}/analysis`,
      screenshotUrls: meta.screenshotKeys.map((_: string, i: number) =>
        `/api/reports/${meta.id}/screenshot/${i}`
      ),
    });
  } catch (err) {
    console.error('[reports-api] get failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy the analysis JSON from S3 (avoids CORS on pre-signed URLs)
app.get('/api/reports/:id/analysis', async (req, res) => {
  try {
    const data = await getAnalysis(req.params.id);
    if (!data) {
      res.status(404).json({ error: 'Analysis not found' });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error('[reports-api] get analysis failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Proxy screenshots from S3
app.get('/api/reports/:id/screenshot/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const result = await getScreenshot(req.params.id, index);
    if (!result) {
      res.status(404).end();
      return;
    }
    res.type(result.contentType).send(result.buffer);
  } catch (err) {
    console.error('[reports-api] get screenshot failed:', err);
    res.status(500).end();
  }
});

// ── Cleanup endpoint (call from cron or manually) ───────────────
//
// POST /api/cleanup
//   Deletes all expired reports from S3.
//   In production, wire this to a daily cron job or a Timeweb scheduled task.
//

app.post('/api/cleanup', async (_req, res) => {
  try {
    const deleted = await cleanupExpired();
    res.json({ deleted });
  } catch (err) {
    console.error('[reports-api] cleanup failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Standalone report viewer ────────────────────────────────────
//
// GET /report/:id
//   A simple HTML page that fetches the report data from /api/reports/:id
//   and renders it. This is what the share link points to.
//

app.get('/report/:id', (_req, res) => {
  const id = _req.params.id;
  res.type('html').send(buildReportHtml(id));
});

function buildReportHtml(id: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spine Benchmark Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0a0a12; color: #d0d0d8; line-height: 1.5; }
    .page { max-width: 880px; margin: 0 auto; padding: 32px 24px 64px; }

    /* Header */
    .header { border-bottom: 1px solid #1a1a2e; padding-bottom: 24px; margin-bottom: 32px; }
    .header h1 { font-size: 1.5rem; color: #4fc3f7; font-weight: 700; margin-bottom: 4px; }
    .header .sub { color: #666; font-size: 0.82rem; }
    .header .sub span { margin-right: 16px; }

    /* Impact cards */
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .card { background: #111118; border: 1px solid #1a1a2e; border-radius: 12px; padding: 20px; }
    .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 8px; }
    .card-value { font-size: 2rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .card-anim { font-size: 0.75rem; color: #555; margin-top: 4px; }

    /* Badges */
    .badge { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge-minimal { background: #0d2818; color: #34D399; }
    .badge-low { background: #1a2e0a; color: #A3E635; }
    .badge-moderate { background: #2e1f06; color: #FBBF24; }
    .badge-high { background: #2e1007; color: #FB923C; border: 1px solid #FB923C33; }
    .badge-veryHigh { background: #2e0a0a; color: #F87171; border: 1px solid #F8717133; }

    /* Color for impact values */
    .v-minimal { color: #34D399; }
    .v-low { color: #A3E635; }
    .v-moderate { color: #FBBF24; }
    .v-high { color: #FB923C; }
    .v-veryHigh { color: #F87171; }

    /* Table */
    h2 { font-size: 1.1rem; color: #b0b8c4; font-weight: 600; margin: 32px 0 12px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { color: #555; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; padding: 8px 12px; text-align: left; border-bottom: 1px solid #1a1a2e; }
    tbody td { padding: 10px 12px; font-size: 0.85rem; border-bottom: 1px solid #111118; }
    tbody tr:hover { background: #111118; }
    .num { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; text-align: right; }
    .row-warn { background: #1a150a; }
    .row-danger { background: #1a0e0e; }

    /* Advisor (problem highlights) */
    .advisor { margin: 32px 0; }
    .advisor-item { background: #111118; border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; border-left: 4px solid #555; }
    .advisor-item.sev-warning { border-left-color: #FBBF24; }
    .advisor-item.sev-critical { border-left-color: #F87171; }
    .advisor-item.sev-info { border-left-color: #4fc3f7; }
    .advisor-title { font-weight: 600; font-size: 0.9rem; margin-bottom: 4px; }
    .advisor-body { font-size: 0.82rem; color: #888; }
    .advisor-anims { font-size: 0.75rem; color: #555; margin-top: 6px; }
    .advisor-anims span { background: #1a1a2e; padding: 2px 8px; border-radius: 4px; margin-right: 6px; }

    /* Screenshot */
    .screenshots { margin: 32px 0; }
    .screenshots img { width: 100%; border-radius: 10px; border: 1px solid #1a1a2e; }

    /* Hotspots */
    .hotspots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
    .hotspot { background: #111118; border-radius: 8px; padding: 12px 16px; text-align: center; }
    .hotspot-val { font-size: 1.4rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
    .hotspot-label { font-size: 0.7rem; color: #555; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }

    /* Hashes */
    .hashes { background: #0d0d14; border: 1px solid #1a1a2e; border-radius: 10px; padding: 16px 20px; margin: 24px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.72rem; }
    .hashes dt { color: #4fc3f7; margin-top: 8px; }
    .hashes dt:first-child { margin-top: 0; }
    .hashes dd { color: #444; word-break: break-all; }

    /* Footer */
    .footer { text-align: center; color: #333; font-size: 0.72rem; margin-top: 48px; padding-top: 16px; border-top: 1px solid #111118; }
    .footer a { color: #4fc3f7; text-decoration: none; }

    .expired { text-align: center; padding: 120px 20px; color: #444; font-size: 1.1rem; }
    .loading { text-align: center; padding: 120px 20px; color: #555; }

    @media (max-width: 600px) {
      .cards { grid-template-columns: 1fr; }
      .hotspots { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>
<div class="page">
  <div id="root"><div class="loading">Loading report...</div></div>
</div>
<script>
(async () => {
  const root = document.getElementById('root');
  const B = (level) => '<span class="badge badge-' + level + '">' + level + '</span>';
  const V = (level) => 'v-' + level;

  try {
    const res = await fetch('/api/reports/${id}');
    if (!res.ok) {
      root.innerHTML = '<div class="expired">This report has expired or does not exist.</div>';
      return;
    }
    const { meta, analysisUrl, screenshotUrls } = await res.json();
    const analysisRes = await fetch(analysisUrl);
    const a = await analysisRes.json();

    let h = '';

    // Header
    h += '<div class="header">';
    h += '<h1>' + meta.skeletonName + '</h1>';
    h += '<div class="sub">';
    h += '<span>Spine ' + meta.spineVersion + '</span>';
    h += '<span>' + meta.totalAnimations + ' animations</span>';
    h += '<span>' + (a.skeleton?.totalBones || '-') + ' bones</span>';
    h += '<span>' + (a.skeleton?.totalBones ? Math.round(a.skeleton.totalBones * 0.7) : '-') + ' slots</span>';
    h += '</div>';
    h += '<div class="sub" style="margin-top:4px">';
    h += '<span>Created: ' + new Date(meta.createdAt).toLocaleDateString('en', {year:'numeric',month:'short',day:'numeric'}) + '</span>';
    h += '<span>Expires: ' + new Date(meta.expiresAt).toLocaleDateString('en', {year:'numeric',month:'short',day:'numeric'}) + '</span>';
    h += '</div>';
    h += '</div>';

    // Screenshot (hero position, right after header)
    if (screenshotUrls.length > 0) {
      h += '<div class="screenshots">';
      for (const url of screenshotUrls) h += '<img src="' + url + '" loading="lazy" />';
      h += '</div>';
    }

    // Impact cards
    const riWorst = a.summary?.rendering?.worst || { cost: 0, level: 'minimal' };
    const ciWorst = a.summary?.computational?.worst || { cost: 0, level: 'minimal' };
    h += '<div class="cards">';
    h += '<div class="card"><div class="card-label">Rendering Impact (GPU)</div>';
    h += '<div class="card-value ' + V(riWorst.level) + '">' + riWorst.cost.toFixed(1) + '</div>';
    h += '<div>' + B(riWorst.level) + '</div></div>';
    h += '<div class="card"><div class="card-label">Computational Impact (CPU)</div>';
    h += '<div class="card-value ' + V(ciWorst.level) + '">' + ciWorst.cost.toFixed(1) + '</div>';
    h += '<div>' + B(ciWorst.level) + '</div></div>';
    h += '</div>';

    // Hotspots
    if (a.hotspots) {
      const hs = a.hotspots;
      h += '<h2>Performance Hotspots</h2>';
      h += '<div class="hotspots">';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakPageBreaks || 0) + '</div><div class="hotspot-label">Peak Page Breaks</div></div>';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakBlendSwitches || 0) + '</div><div class="hotspot-label">Peak Blend Switches</div></div>';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakMeshDensity || 0) + '</div><div class="hotspot-label">Peak Mesh Vertices</div></div>';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakConstraintLoad || 0) + '</div><div class="hotspot-label">Peak Constraints</div></div>';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakPhysicsConstraints || 0) + '</div><div class="hotspot-label">Peak Physics</div></div>';
      h += '<div class="hotspot"><div class="hotspot-val">' + (hs.peakIkConstraints || 0) + '</div><div class="hotspot-label">Peak IK</div></div>';
      h += '</div>';
    }

    // Advisor (problem highlights with severity coloring)
    if (a.advisor && a.advisor.length > 0) {
      h += '<h2>Optimization Advisor</h2>';
      h += '<div class="advisor">';
      for (const item of a.advisor) {
        h += '<div class="advisor-item sev-' + item.severity + '">';
        h += '<div class="advisor-title">' + (item.titleKey || item.id || 'Advice') + '</div>';
        h += '<div class="advisor-body">' + (item.bodyKey || '') + '</div>';
        if (item.affectedAnimations && item.affectedAnimations.length > 0) {
          h += '<div class="advisor-anims">Affected: ';
          for (const an of item.affectedAnimations) h += '<span>' + an + '</span>';
          h += '</div>';
        }
        h += '</div>';
      }
      h += '</div>';
    }

    // Animation table
    if (a.animations && a.animations.length > 0) {
      h += '<h2>Per-Animation Breakdown</h2>';
      h += '<table><thead><tr><th>Animation</th><th>Duration</th><th class="num">RI</th><th class="num">CI</th><th class="num">Total</th><th>Level</th></tr></thead><tbody>';
      for (const anim of a.animations) {
        const ri = anim.rendering?.cost ?? anim.ri ?? 0;
        const ci = anim.computational?.cost ?? anim.ci ?? 0;
        const total = anim.totalCost ?? anim.total ?? (ri + ci);
        const level = anim.rowTone === 'danger' ? 'veryHigh' : anim.rowTone === 'warning' ? 'high' : (anim.totalLevel || 'minimal');
        const rowClass = anim.rowTone === 'danger' ? 'row-danger' : anim.rowTone === 'warning' ? 'row-warn' : '';
        const dur = typeof anim.durationSec === 'number' ? anim.durationSec.toFixed(2) + 's' : (anim.duration != null ? anim.duration.toFixed(2) + 's' : '-');
        h += '<tr class="' + rowClass + '">';
        h += '<td>' + anim.name + '</td>';
        h += '<td class="num">' + dur + '</td>';
        h += '<td class="num">' + ri.toFixed(1) + '</td>';
        h += '<td class="num">' + ci.toFixed(1) + '</td>';
        h += '<td class="num" style="font-weight:600">' + total.toFixed(1) + '</td>';
        h += '<td>' + B(level) + '</td>';
        h += '</tr>';
      }
      h += '</tbody></table>';
    }

    // File hashes
    if (meta.fileHashes && meta.fileHashes.length > 0) {
      h += '<h2>Source Files</h2>';
      h += '<dl class="hashes">';
      for (const f of meta.fileHashes) {
        h += '<dt>' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)</dt>';
        h += '<dd>SHA-256: ' + f.sha256 + '</dd>';
      }
      h += '</dl>';
    }

    // Footer
    h += '<div class="footer">';
    h += 'Generated by <a href="https://github.com/schmooky/spine-benchmark">Spine Benchmark</a>';
    h += ' - Report ID: ' + meta.id;
    h += '</div>';

    root.innerHTML = h;
  } catch (err) {
    root.innerHTML = '<div class="expired">Failed to load report: ' + err.message + '</div>';
  }
})();
</script>
</body>
</html>`;
}

// ── Start ───────────────────────────────────────────────────────

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[reports-api] listening on 0.0.0.0:${config.port}`);
  console.log(`[reports-api] public URL: ${config.publicUrl}`);
  console.log(`[reports-api] report TTL: ${config.reportTtlDays} days`);
});
