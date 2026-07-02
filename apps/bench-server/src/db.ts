import pg from "pg";
import { MongoClient, type Collection } from "mongodb";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { DeviceInfo, RunRecord, RunSummary, RunUpload, ScenarioResult } from "./types.js";

/**
 * Run rows live in Postgres or MongoDB (bench_runs), picked by
 * STORAGE_MODE. STORAGE_MODE=memory swaps in a process-local Map with the
 * same interface for local dev / smoke tests.
 */

export interface RunListItem {
  id: string;
  createdAt: string;
  deviceLabel: string;
  avgFps: number;
  degraded: boolean;
  quick: boolean;
  /** client that produced the run; < "0.3.0" is a LEGACY (pre-GPU-ms) run. */
  clientVersion: string;
}

interface RunStore {
  init(): Promise<void>;
  healthy(): Promise<boolean>;
  insert(id: string, upload: RunUpload, captureKey: string | null): Promise<void>;
  /** True when the id already exists (caller retries with a fresh id). */
  exists(id: string): Promise<boolean>;
  get(id: string): Promise<RunRecord | null>;
  list(limit: number): Promise<RunListItem[]>;
}

// ── Postgres ───────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bench_runs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_version TEXT NOT NULL,
  device JSONB NOT NULL,
  scenarios JSONB NOT NULL,
  summary JSONB NOT NULL,
  capture_key TEXT
);
CREATE INDEX IF NOT EXISTS bench_runs_created_at ON bench_runs (created_at DESC);
`;

class PgStore implements RunStore {
  private pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
    logger.info("postgres schema ready");
  }

  async healthy(): Promise<boolean> {
    try {
      await this.pool.query("SELECT 1");
      return true;
    } catch (err) {
      logger.warn({ err }, "postgres health check failed");
      return false;
    }
  }

  async insert(id: string, u: RunUpload, captureKey: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO bench_runs (id, client_version, device, scenarios, summary, capture_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, u.clientVersion, u.device, JSON.stringify(u.scenarios), u.summary, captureKey],
    );
  }

  async exists(id: string): Promise<boolean> {
    const r = await this.pool.query("SELECT 1 FROM bench_runs WHERE id = $1", [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async get(id: string): Promise<RunRecord | null> {
    const r = await this.pool.query(
      `SELECT id, created_at, client_version, device, scenarios, summary, capture_key
       FROM bench_runs WHERE id = $1`,
      [id],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      clientVersion: row.client_version,
      device: row.device,
      scenarios: row.scenarios,
      summary: row.summary,
      captureKey: row.capture_key,
    };
  }

  async list(limit: number): Promise<RunListItem[]> {
    const r = await this.pool.query(
      `SELECT id, created_at, client_version, device->>'label' AS device_label,
              summary->>'avgFps' AS avg_fps,
              summary->>'degraded' AS degraded,
              summary->>'quick' AS quick
       FROM bench_runs ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return r.rows.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      deviceLabel: row.device_label ?? "unknown",
      avgFps: Number(row.avg_fps ?? 0),
      degraded: row.degraded === "true",
      quick: row.quick === "true",
      clientVersion: row.client_version ?? "0",
    }));
  }
}

// ── MongoDB ────────────────────────────────────────────────

interface RunDoc {
  _id: string;
  createdAt: Date;
  clientVersion: string;
  device: DeviceInfo;
  scenarios: ScenarioResult[];
  summary: RunSummary;
  captureKey: string | null;
}

class MongoStore implements RunStore {
  private client = new MongoClient(config.databaseUrl, {
    serverSelectionTimeoutMS: 5000,
  });

  private coll(): Collection<RunDoc> {
    return this.client.db().collection<RunDoc>("bench_runs");
  }

  async init(): Promise<void> {
    await this.client.connect();
    await this.coll().createIndex({ createdAt: -1 });
    logger.info("mongodb ready");
  }

  async healthy(): Promise<boolean> {
    try {
      await this.client.db().command({ ping: 1 });
      return true;
    } catch (err) {
      logger.warn({ err }, "mongodb health check failed");
      return false;
    }
  }

  async insert(id: string, u: RunUpload, captureKey: string | null): Promise<void> {
    await this.coll().insertOne({
      _id: id,
      createdAt: new Date(),
      clientVersion: u.clientVersion,
      device: u.device,
      scenarios: u.scenarios,
      summary: u.summary,
      captureKey,
    });
  }

  async exists(id: string): Promise<boolean> {
    const n = await this.coll().countDocuments({ _id: id }, { limit: 1 });
    return n > 0;
  }

  async get(id: string): Promise<RunRecord | null> {
    const doc = await this.coll().findOne({ _id: id });
    if (!doc) return null;
    return {
      id: doc._id,
      createdAt: doc.createdAt.toISOString(),
      clientVersion: doc.clientVersion,
      device: doc.device,
      scenarios: doc.scenarios,
      summary: doc.summary,
      captureKey: doc.captureKey,
    };
  }

  async list(limit: number): Promise<RunListItem[]> {
    const docs = await this.coll()
      .find({}, { projection: { device: 1, summary: 1, createdAt: 1, clientVersion: 1 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => ({
      id: d._id,
      createdAt: d.createdAt.toISOString(),
      deviceLabel: d.device?.label ?? "unknown",
      avgFps: d.summary?.avgFps ?? 0,
      degraded: d.summary?.degraded ?? false,
      quick: d.summary?.quick ?? false,
      clientVersion: d.clientVersion ?? "0",
    }));
  }
}

// ── In-memory (dev only) ───────────────────────────────────

class MemoryStore implements RunStore {
  private rows = new Map<string, RunRecord>();

  async init(): Promise<void> {
    logger.warn("STORAGE_MODE=memory - runs are NOT persisted");
  }
  async healthy(): Promise<boolean> {
    return true;
  }
  async insert(id: string, u: RunUpload, captureKey: string | null): Promise<void> {
    this.rows.set(id, {
      id,
      createdAt: new Date().toISOString(),
      clientVersion: u.clientVersion,
      device: u.device,
      scenarios: u.scenarios,
      summary: u.summary,
      captureKey,
    });
  }
  async exists(id: string): Promise<boolean> {
    return this.rows.has(id);
  }
  async get(id: string): Promise<RunRecord | null> {
    return this.rows.get(id) ?? null;
  }
  async list(limit: number): Promise<RunListItem[]> {
    return [...this.rows.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        deviceLabel: r.device.label,
        avgFps: r.summary.avgFps,
        degraded: r.summary.degraded,
        quick: r.summary.quick,
        clientVersion: r.clientVersion,
      }));
  }
}

export const runStore: RunStore =
  config.storageMode === "memory"
    ? new MemoryStore()
    : config.storageMode === "mongo"
      ? new MongoStore()
      : new PgStore();
