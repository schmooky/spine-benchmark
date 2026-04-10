import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { createReport, getReport, cleanupExpired } from './reports.js';
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
    const report = await getReport(req.params.id);
    if (!report) {
      res.status(404).json({ error: 'Report not found or expired' });
      return;
    }
    res.json(report);
  } catch (err) {
    console.error('[reports-api] get failed:', err);
    res.status(500).json({ error: 'Internal server error' });
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
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spine Benchmark Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0c0c14; color: #e0e0e0; padding: 24px; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 1.4rem; color: #4fc3f7; margin-bottom: 8px; }
    .meta { color: #888; font-size: 0.85rem; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge-minimal { background: #1b4332; color: #34D399; }
    .badge-low { background: #365314; color: #A3E635; }
    .badge-moderate { background: #422006; color: #FBBF24; }
    .badge-high { background: #431407; color: #FB923C; }
    .badge-veryHigh { background: #450a0a; color: #F87171; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #1a1a2e; font-size: 0.85rem; }
    th { color: #888; font-weight: 500; }
    .screenshots img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
    .hashes { background: #111; border-radius: 8px; padding: 16px; margin: 16px 0; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; }
    .hashes dt { color: #4fc3f7; }
    .hashes dd { color: #666; margin-bottom: 8px; word-break: break-all; }
    .expired { text-align: center; padding: 80px 20px; color: #666; }
    .loading { text-align: center; padding: 80px 20px; color: #888; }
  </style>
</head>
<body>
  <div id="root"><div class="loading">Loading report...</div></div>
  <script>
    (async () => {
      const root = document.getElementById('root');
      try {
        const res = await fetch('/api/reports/${id}');
        if (!res.ok) {
          root.innerHTML = '<div class="expired">This report has expired or does not exist.</div>';
          return;
        }
        const { meta, analysisUrl, screenshotUrls } = await res.json();
        const analysisRes = await fetch(analysisUrl);
        const analysis = await analysisRes.json();

        let html = '<h1>Spine Benchmark Report: ' + meta.skeletonName + '</h1>';
        html += '<div class="meta">Spine ' + meta.spineVersion + ' - ' + meta.totalAnimations + ' animations - created ' + new Date(meta.createdAt).toLocaleDateString() + ' - expires ' + new Date(meta.expiresAt).toLocaleDateString() + '</div>';
        html += '<div>Worst RI: <span class="badge badge-' + meta.worstRiLevel + '">' + meta.worstRiLevel + '</span> Worst CI: <span class="badge badge-' + meta.worstCiLevel + '">' + meta.worstCiLevel + '</span></div>';

        if (analysis.animations) {
          html += '<table><thead><tr><th>Animation</th><th>RI</th><th>CI</th><th>Total</th><th>Level</th></tr></thead><tbody>';
          for (const a of analysis.animations) {
            html += '<tr><td>' + a.name + '</td><td>' + (a.ri ?? a.rendering?.cost ?? '-') + '</td><td>' + (a.ci ?? a.computational?.cost ?? '-') + '</td><td>' + (a.total ?? a.totalCost ?? '-') + '</td><td><span class="badge badge-' + (a.totalLevel ?? a.rowTone ?? 'minimal') + '">' + (a.totalLevel ?? a.rowTone ?? '-') + '</span></td></tr>';
          }
          html += '</tbody></table>';
        }

        if (screenshotUrls.length > 0) {
          html += '<h2 style="margin-top:24px;font-size:1.1rem;">Screenshots</h2><div class="screenshots">';
          for (const url of screenshotUrls) {
            html += '<img src="' + url + '" loading="lazy" />';
          }
          html += '</div>';
        }

        if (meta.fileHashes && meta.fileHashes.length > 0) {
          html += '<h2 style="margin-top:24px;font-size:1.1rem;">Source files</h2><dl class="hashes">';
          for (const f of meta.fileHashes) {
            html += '<dt>' + f.name + ' (' + (f.size / 1024).toFixed(1) + ' KB)</dt>';
            html += '<dd>SHA-256: ' + f.sha256 + '</dd>';
          }
          html += '</dl>';
        }

        root.innerHTML = html;
      } catch (err) {
        root.innerHTML = '<div class="expired">Failed to load report: ' + err.message + '</div>';
      }
    })();
  </script>
</body>
</html>`);
});

// ── Start ───────────────────────────────────────────────────────

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[reports-api] listening on 0.0.0.0:${config.port}`);
  console.log(`[reports-api] public URL: ${config.publicUrl}`);
  console.log(`[reports-api] report TTL: ${config.reportTtlDays} days`);
});
