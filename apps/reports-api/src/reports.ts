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
export async function getAnalysis(id: string): Promise<unknown | null> {
  return getJson(`reports/${id}/analysis.json`);
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
