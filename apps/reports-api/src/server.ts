import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { config } from './config.js';
import { createReport, getReport, getAnalysis, getScreenshot, cleanupExpired, createEncryptedReport, getEncryptedEnvelope, getEncryptedMeta, getPublicData } from './reports.js';
import type { FileHash, CreateReportInput } from './reports.js';
import { renderReport, renderEncryptedReport } from './reportHtml.js';

// Resolve the Spinefolio dist directory via the installed package so the
// encrypted report viewer can import the widget at `/assets/spinefolio.js`.
const require = createRequire(import.meta.url);
const spinefolioDistDir = dirname(require.resolve('@spine-benchmark/spinefolio/package.json')) + '/dist';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 50 } });

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '5mb' }));

// Static Spinefolio bundle for the encrypted report viewer. We explicitly
// alias `/assets/spinefolio.js` to the ESM build so `import()` works.
app.get('/assets/spinefolio.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(join(spinefolioDistDir, 'spinefolio.module.js'));
});
app.get('/assets/spinefolio.css', (_req, res) => {
  res.type('text/css');
  res.sendFile(join(spinefolioDistDir, 'spinefolio.css'));
});

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
      animationNames: meta.animationNames || [],
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

// ── Create encrypted report ─────────────────────────────────────

app.post('/api/reports/encrypted', async (req, res) => {
  try {
    const { publicData, envelope, ttlDays } = req.body || {};
    if (!publicData || typeof publicData !== 'object') {
      res.status(400).json({ error: 'Missing publicData field' });
      return;
    }
    if (!envelope || typeof envelope !== 'object') {
      res.status(400).json({ error: 'Missing envelope field' });
      return;
    }
    const result = await createEncryptedReport(publicData, envelope, Number(ttlDays) || 7);
    res.status(201).json(result);
  } catch (err) {
    console.error('[reports-api] encrypted create failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reports/:id/public', async (req, res) => {
  try {
    const data = await getPublicData(req.params.id);
    if (!data) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(data);
  } catch (err) {
    console.error('[reports-api] get public failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/reports/:id/envelope', async (req, res) => {
  try {
    const envelope = await getEncryptedEnvelope(req.params.id);
    if (!envelope) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(envelope);
  } catch (err) {
    console.error('[reports-api] get envelope failed:', err);
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

app.get('/report/:id', async (req, res) => {
  try {
    // Check if this is an encrypted report first
    const encMeta = await getEncryptedMeta(req.params.id);
    if (encMeta?.encrypted) {
      const html = renderEncryptedReport(req.params.id);
      res.type('html').send(html);
      return;
    }
    // Fall back to the legacy (pre-encryption) report viewer
    const html = await renderReport(req.params.id);
    res.type('html').send(html);
  } catch (err) {
    console.error('[reports-api] render report failed:', err);
    res.status(500).type('html').send('<html><body>Failed to render report</body></html>');
  }
});

// ── Start ───────────────────────────────────────────────────────

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[reports-api] listening on 0.0.0.0:${config.port}`);
  console.log(`[reports-api] public URL: ${config.publicUrl}`);
  console.log(`[reports-api] report TTL: ${config.reportTtlDays} days`);
});
