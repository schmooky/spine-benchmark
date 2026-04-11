/**
 * Report lifecycle: create, read, list, cleanup.
 *
 * Storage layout in S3:
 *   reports/<id>/meta.json       - report metadata (analysis summary, file hashes, timestamps)
 *   reports/<id>/analysis.json   - full analysis payload
 *   reports/<id>/screenshot.png  - canvas screenshot (optional)
 *   reports/<id>/screenshot2.png - additional screenshots (optional)
 */
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { putJson, putFile, getJson, getBuffer, listPrefix, deleteObject } from './s3.js';

/**
 * Create a hybrid report: public metrics (visible to anyone with the
 * link) + encrypted envelope (GIFs, screenshot, asset bundle - unlocked
 * with the user's password).
 *
 * The server stores both blobs unchanged and serves them back. It never
 * sees the private data's plaintext.
 *
 * TTL is in days, clamped to [1, 90] to prevent abuse.
 */
export async function createEncryptedReport(
  publicData: unknown,
  envelope: unknown,
  ttlDays: number,
): Promise<{ id: string; url: string; expiresAt: string }> {
  const id = nanoid(12);
  const now = new Date();
  const clampedTtl = Math.max(1, Math.min(90, Math.round(ttlDays || config.reportTtlDays)));
  const expiresAt = new Date(now.getTime() + clampedTtl * 24 * 60 * 60 * 1000);

  const meta = {
    id,
    version: 3,
    encrypted: true,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await putJson(`reports/${id}/public.json`, publicData);
  await putJson(`reports/${id}/envelope.json`, envelope);
  await putJson(`reports/${id}/meta.json`, meta);

  const url = `${config.publicUrl}/report/${id}`;
  return { id, url, expiresAt: expiresAt.toISOString() };
}

export async function getPublicData(id: string): Promise<unknown | null> {
  return getJson(`reports/${id}/public.json`);
}

export async function getEncryptedEnvelope(id: string): Promise<unknown | null> {
  return getJson(`reports/${id}/envelope.json`);
}

interface EncryptedMeta {
  id: string;
  createdAt: string;
  expiresAt: string;
  encrypted: boolean;
  version?: number;
}

export async function getEncryptedMeta(id: string): Promise<EncryptedMeta | null> {
  const meta = await getJson<EncryptedMeta>(`reports/${id}/meta.json`);
  if (!meta) return null;
  if (new Date(meta.expiresAt) < new Date()) return null;
  return meta;
}

export interface FileHash {
  name: string;
  /** SHA-256 hex digest computed client-side */
  sha256: string;
  size: number;
}

export interface ReportMeta {
  id: string;
  createdAt: string;
  expiresAt: string;
  skeletonName: string;
  spineVersion: string;
  worstRiLevel: string;
  worstCiLevel: string;
  totalAnimations: number;
  fileHashes: FileHash[];
  screenshotKeys: string[];
  animationNames?: string[];
}

export interface CreateReportInput {
  analysis: unknown;
  skeletonName: string;
  spineVersion: string;
  worstRiLevel: string;
  worstCiLevel: string;
  totalAnimations: number;
  fileHashes: FileHash[];
  animationNames?: string[];
}

/**
 * Narrow view of the analysis JSON as consumed by the report HTML
 * renderer. The full `SpineAnalysisResult` type from
 * `@spine-benchmark/metrics-reporting` has many more fields, but
 * we only strictly need these to generate the page. Handlebars
 * partials still receive the whole blob untyped - this interface
 * is the contract for the TypeScript code path only.
 */
export interface AnalysisPayload {
  animationTimelines?: Record<string, Array<{ time: number; ri: number; ci: number }>>;
  animations?: unknown[];
  skeleton?: unknown;
  globalMesh?: unknown;
  globalClipping?: unknown;
  globalBlendMode?: unknown;
  globalPhysics?: unknown;
  stats?: unknown;
  [extraKey: string]: unknown;
}

/**
 * Create a new report. Returns the report ID and share URL.
 */
export async function createReport(
  input: CreateReportInput,
  screenshots: Array<{ buffer: Buffer; mimetype: string; originalname: string }>,
): Promise<{ id: string; url: string; expiresAt: string }> {
  const id = nanoid(12);
  const prefix = `reports/${id}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.reportTtlDays * 24 * 60 * 60 * 1000);

  // Upload analysis payload
  await putJson(`${prefix}/analysis.json`, input.analysis);

  // Upload screenshots
  const screenshotKeys: string[] = [];
  for (let i = 0; i < screenshots.length; i++) {
    const ss = screenshots[i];
    const ext = ss.mimetype === 'image/png' ? 'png' : ss.mimetype === 'image/gif' ? 'gif' : ss.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const key = `${prefix}/screenshot${i > 0 ? i + 1 : ''}.${ext}`;
    await putFile(key, ss.buffer, ss.mimetype);
    screenshotKeys.push(key);
  }

  // Build and upload metadata
  const meta: ReportMeta = {
    id,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    skeletonName: input.skeletonName,
    spineVersion: input.spineVersion,
    worstRiLevel: input.worstRiLevel,
    worstCiLevel: input.worstCiLevel,
    totalAnimations: input.totalAnimations,
    fileHashes: input.fileHashes,
    screenshotKeys,
    animationNames: input.animationNames,
  };
  await putJson(`${prefix}/meta.json`, meta);

  const url = `${config.publicUrl}/report/${id}`;
  return { id, url, expiresAt: expiresAt.toISOString() };
}

/**
 * Fetch a report's metadata. Returns null if expired or not found.
 */
export async function getReport(id: string): Promise<ReportMeta | null> {
  const prefix = `reports/${id}`;
  const meta = await getJson<ReportMeta>(`${prefix}/meta.json`);
  if (!meta) return null;
  if (new Date(meta.expiresAt) < new Date()) return null;
  return meta;
}

/**
 * Fetch the analysis JSON for a report.
 */
export async function getAnalysis(id: string): Promise<AnalysisPayload | null> {
  return getJson<AnalysisPayload>(`reports/${id}/analysis.json`);
}

/**
 * Fetch a screenshot buffer for a report.
 */
export async function getScreenshot(id: string, index: number): Promise<{ buffer: Buffer; contentType: string } | null> {
  // Find the key from the meta
  const meta = await getReport(id);
  if (!meta) return null;
  const key = meta.screenshotKeys[index];
  if (!key) return null;
  return getBuffer(key);
}

/**
 * Delete all expired reports from S3. Designed to run on a cron (e.g. daily).
 */
export async function cleanupExpired(): Promise<number> {
  const keys = await listPrefix('reports/');
  const metaKeys = keys.filter(k => k.endsWith('/meta.json'));
  let deleted = 0;

  for (const metaKey of metaKeys) {
    const meta = await getJson<ReportMeta>(metaKey);
    if (!meta) continue;
    if (new Date(meta.expiresAt) >= new Date()) continue;

    const prefix = metaKey.replace('/meta.json', '');
    const reportKeys = await listPrefix(prefix);
    for (const key of reportKeys) {
      await deleteObject(key);
    }
    deleted++;
  }

  return deleted;
}
