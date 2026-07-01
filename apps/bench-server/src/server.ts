import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { config } from "./config.js";
import { logger, httpLogger } from "./logger.js";
import { runStore } from "./db.js";
import { captureStore } from "./storage.js";
import { newRunId } from "./ids.js";
import { renderRunReport } from "./reportHtml.js";
import type { RunUpload } from "./types.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(httpLogger);
app.use(
  cors({
    origin: (origin, cb) => {
      // non-browser tools (curl, server-to-server) send no origin
      if (!origin || config.corsOrigins.includes(origin)) cb(null, true);
      else cb(new Error("origin not allowed"));
    },
  }),
);
app.use(express.json({ limit: config.bodyLimit }));

const ingestLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Probes ─────────────────────────────────────────────────
// livez: the process is up and serving.
// healthz: dependencies (postgres + s3) are reachable too.

import { getModel, setModel, type CoefficientTable } from "./model.js";

app.get("/livez", (_req, res) => {
  res.json({ status: "live" });
});

// Fitted cost-model coefficients (per-GPU-family weights + ms budgets). Clients
// (new-site meter) fetch this to predict ms and % of budget. GET is public;
// POST (offline fit pushing a new table) needs MODEL_WRITE_TOKEN if set.
app.get("/api/model", (_req, res) => {
  res.json(getModel());
});

app.post("/api/model", (req, res) => {
  const token = process.env.MODEL_WRITE_TOKEN;
  if (token && req.header("authorization") !== `Bearer ${token}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    setModel(req.body as CoefficientTable);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "invalid model" });
  }
});

app.get("/healthz", async (_req, res) => {
  const [db, s3] = await Promise.all([runStore.healthy(), captureStore.healthy()]);
  const ok = db && s3;
  const storeName =
    config.storageMode === "mongo"
      ? "mongodb"
      : config.storageMode === "memory"
        ? "memory"
        : "postgres";
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    storageMode: config.storageMode,
    checks: { [storeName]: db ? "ok" : "fail", s3: s3 ? "ok" : "fail" },
  });
});

// ── Ingest ─────────────────────────────────────────────────

function isValidUpload(b: unknown): b is RunUpload {
  if (typeof b !== "object" || b === null) return false;
  const u = b as Partial<RunUpload>;
  return (
    typeof u.clientVersion === "string" &&
    typeof u.device === "object" &&
    u.device !== null &&
    typeof u.device.label === "string" &&
    Array.isArray(u.scenarios) &&
    typeof u.summary === "object" &&
    u.summary !== null &&
    typeof u.capture === "object" &&
    u.capture !== null
  );
}

app.post("/api/runs", ingestLimiter, async (req, res) => {
  const body = req.body as unknown;
  if (!isValidUpload(body)) {
    res.status(400).json({ error: "malformed run upload" });
    return;
  }

  try {
    // 8-char ids: retry on the unlikely collision
    let id = newRunId();
    for (let attempt = 0; attempt < 3 && (await runStore.exists(id)); attempt++) {
      id = newRunId();
    }

    const captureKey = await captureStore.put(id, body.capture);
    await runStore.insert(id, body, captureKey);

    logger.info(
      {
        runId: id,
        device: body.device.label,
        avgFps: body.summary.avgFps,
        scenarios: body.scenarios.length,
        quick: body.summary.quick,
      },
      "run ingested",
    );
    res.status(201).json({ id, reportUrl: `${config.publicUrl}/r/${id}` });
  } catch (err) {
    logger.error({ err }, "run ingest failed");
    res.status(503).json({ error: "storage unavailable, try again later" });
  }
});

// ── Reports ────────────────────────────────────────────────

app.get("/api/runs", readLimiter, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    res.json({ runs: await runStore.list(limit) });
  } catch (err) {
    logger.error({ err }, "run list failed");
    res.status(503).json({ error: "storage unavailable" });
  }
});

app.get("/api/runs/:id", readLimiter, async (req, res) => {
  try {
    const run = await runStore.get(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    if (req.query.include === "capture" && run.captureKey) {
      const capture = await captureStore.get(run.captureKey);
      res.json({ ...run, capture });
      return;
    }
    res.json(run);
  } catch (err) {
    logger.error({ err }, "run fetch failed");
    res.status(503).json({ error: "storage unavailable" });
  }
});

app.get("/r/:id", readLimiter, async (req, res) => {
  try {
    const run = await runStore.get(String(req.params.id));
    if (!run) {
      res.status(404).type("text/html").send("<h1>run not found</h1>");
      return;
    }
    res.type("text/html").send(renderRunReport(run));
  } catch (err) {
    logger.error({ err }, "report render failed");
    res.status(503).type("text/html").send("<h1>storage unavailable</h1>");
  }
});

// ── Boot ───────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await runStore.init();
  } catch (err) {
    // boot anyway: livez should answer even when pg is down so the platform
    // doesn't kill-loop the container; healthz reports the truth
    logger.error({ err }, "storage init failed - serving degraded");
  }
  app.listen(config.port, () => {
    logger.info(
      { port: config.port, storageMode: config.storageMode },
      "bench-server listening",
    );
  });
}

void main();
