import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config } from './config.js';
import { createReport, getReport, getAnalysis, getScreenshot, cleanupExpired } from './reports.js';
import type { FileHash, CreateReportInput } from './reports.js';
import { buildReportHtml } from './reportHtml.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 50 } });

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

// ── Health ──────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ── Create report ───────────────────────────────────────────────

app.post('/api/reports', upload.array('screenshots', 50), async (req, res) => {
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
      animationNames?: string[];
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

    // Store animation names in the meta so the report viewer can match
    // GIFs to animations. This is an addendum after createReport.
    if (meta.animationNames && meta.animationNames.length > 0) {
      const { putJson, getJson } = await import('./s3.js');
      const storedMeta = await getJson<any>(`reports/${result.id}/meta.json`);
      if (storedMeta) {
        storedMeta.animationNames = meta.animationNames;
        await putJson(`reports/${result.id}/meta.json`, storedMeta);
      }
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('[reports-api] create failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Get report ──────────────────────────────────────────────────

app.get('/api/reports/:id', async (req, res) => {
  try {
    const meta = await getReport(req.params.id);
    if (!meta) {
      res.status(404).json({ error: 'Report not found or expired' });
      return;
    }
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

// ── Proxy endpoints (avoid CORS on S3) ──────────────────────────

app.get('/api/reports/:id/analysis', async (req, res) => {
  try {
    const data = await getAnalysis(req.params.id);
    if (!data) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(data);
  } catch (err) {
    console.error('[reports-api] get analysis failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reports/:id/screenshot/:index', async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const result = await getScreenshot(req.params.id, index);
    if (!result) { res.status(404).end(); return; }
    res.type(result.contentType).send(result.buffer);
  } catch (err) {
    console.error('[reports-api] get screenshot failed:', err);
    res.status(500).end();
  }
});

// ── Cleanup ─────────────────────────────────────────────────────

app.post('/api/cleanup', async (_req, res) => {
  try {
    const deleted = await cleanupExpired();
    res.json({ deleted });
  } catch (err) {
    console.error('[reports-api] cleanup failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Report viewer ───────────────────────────────────────────────

app.get('/report/:id', (_req, res) => {
  res.type('html').send(buildReportHtml(_req.params.id));
});

// ── Start ───────────────────────────────────────────────────────

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[reports-api] listening on 0.0.0.0:${config.port}`);
  console.log(`[reports-api] public URL: ${config.publicUrl}`);
  console.log(`[reports-api] report TTL: ${config.reportTtlDays} days`);
});
