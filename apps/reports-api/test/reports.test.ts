/**
 * Unit tests for the report lifecycle in apps/reports-api/src/reports.ts.
 *
 * These tests mock the S3 layer so they can run in a plain Node
 * environment with no AWS credentials. The goal is to pin the
 * rules the server relies on:
 *
 *  - TTL is clamped to [1, 90] days, regardless of caller input.
 *  - Encrypted reports store public.json + envelope.json + meta.json
 *    at the documented key layout.
 *  - `getEncryptedMeta` returns null for expired records.
 *  - Screenshot file extensions are picked from the upload MIME type.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the S3 layer with in-memory stand-ins. `vi.mock` is hoisted so
// this block must not reference anything declared below outside a
// factory function.
vi.mock('../src/s3.js', () => {
  const store = new Map<string, unknown>();
  const files = new Map<string, { body: Buffer; contentType: string }>();
  return {
    __store: store,
    __files: files,
    putJson: vi.fn(async (key: string, data: unknown) => {
      store.set(key, data);
    }),
    putFile: vi.fn(async (key: string, body: Buffer, contentType: string) => {
      files.set(key, { body, contentType });
    }),
    getJson: vi.fn(async (key: string) => store.get(key) ?? null),
    getBuffer: vi.fn(async (key: string) => files.get(key) ?? null),
    listPrefix: vi.fn(async (prefix: string) =>
      [...store.keys(), ...files.keys()].filter(k => k.startsWith(prefix)),
    ),
    deleteObject: vi.fn(async (key: string) => {
      store.delete(key);
      files.delete(key);
    }),
  };
});

// Minimal config stub so `config.publicUrl`, `config.reportTtlDays`
// and `config.s3.*` all resolve without .env.
vi.mock('../src/config.js', () => ({
  config: {
    port: 0,
    publicUrl: 'https://example.test',
    corsOrigin: '*',
    reportTtlDays: 7,
    s3: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'test-bucket',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  },
}));

import {
  createEncryptedReport,
  createReport,
  getEncryptedMeta,
  cleanupExpired,
} from '../src/reports.js';
import type { CreateReportInput } from '../src/reports.js';
// Pull the mock store through the mocked module so tests can inspect it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as s3Mock from '../src/s3.js';
const store = (s3Mock as unknown as { __store: Map<string, unknown> }).__store;
const files = (s3Mock as unknown as { __files: Map<string, { body: Buffer; contentType: string }> }).__files;

function baseInput(): CreateReportInput {
  return {
    analysis: { hello: 'world' },
    skeletonName: 'spineboy',
    spineVersion: '4.2',
    worstRiLevel: 'moderate',
    worstCiLevel: 'low',
    totalAnimations: 4,
    fileHashes: [
      { name: 'spineboy.skel', sha256: 'abc', size: 1024 },
    ],
    animationNames: ['idle', 'walk', 'run', 'jump'],
  };
}

describe('createEncryptedReport', () => {
  beforeEach(() => {
    store.clear();
    files.clear();
  });

  it('clamps ttlDays into [1, 90]', async () => {
    const low = await createEncryptedReport({ p: 1 }, { e: 1 }, 0);
    const high = await createEncryptedReport({ p: 2 }, { e: 2 }, 99999);
    const negative = await createEncryptedReport({ p: 3 }, { e: 3 }, -5);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // 0 -> falls back to config.reportTtlDays (7), then clamped to [1, 90].
    // The important invariant here is "never unbounded" - exact default is
    // covered in the dedicated fallback test below.
    const lowDelta = new Date(low.expiresAt).getTime() - now;
    expect(lowDelta).toBeGreaterThanOrEqual(1 * day - 5_000);
    expect(lowDelta).toBeLessThanOrEqual(90 * day + 5_000);

    const highDelta = new Date(high.expiresAt).getTime() - now;
    expect(highDelta).toBeLessThanOrEqual(90 * day + 5_000);
    expect(highDelta).toBeGreaterThanOrEqual(89 * day);

    const negDelta = new Date(negative.expiresAt).getTime() - now;
    expect(negDelta).toBeGreaterThanOrEqual(1 * day - 5_000);
  });

  it('falls back to config.reportTtlDays when caller passes 0/NaN', async () => {
    const created = await createEncryptedReport({ p: 1 }, { e: 1 }, 0);
    const delta = new Date(created.expiresAt).getTime() - Date.now();
    const day = 24 * 60 * 60 * 1000;
    // config.reportTtlDays is mocked at 7 above.
    expect(delta).toBeGreaterThanOrEqual(6.9 * day);
    expect(delta).toBeLessThanOrEqual(7.1 * day);
  });

  it('writes public.json + envelope.json + meta.json under reports/<id>/', async () => {
    const result = await createEncryptedReport({ secret: 'pub' }, { secret: 'env' }, 7);
    expect(store.has(`reports/${result.id}/public.json`)).toBe(true);
    expect(store.has(`reports/${result.id}/envelope.json`)).toBe(true);
    expect(store.has(`reports/${result.id}/meta.json`)).toBe(true);
    expect(store.get(`reports/${result.id}/public.json`)).toEqual({ secret: 'pub' });
    expect(store.get(`reports/${result.id}/envelope.json`)).toEqual({ secret: 'env' });
  });

  it('stores the envelope unmodified (server never mutates it)', async () => {
    // The server's job is to be a dumb carrier for the encrypted blob.
    // If anything here starts transforming the envelope, the round-trip
    // with the client decrypter will break silently - pin the invariant.
    const envelope = {
      v: 1,
      alg: 'AES-GCM',
      iv: 'AAAAAAAAAAAAAAAA',
      ct: 'opaquebase64',
      nested: { extra: 'fields', allowed: true },
    };
    const result = await createEncryptedReport({}, envelope, 7);
    expect(store.get(`reports/${result.id}/envelope.json`)).toEqual(envelope);
  });

  it('returns a share URL pointing at publicUrl/report/<id>', async () => {
    const result = await createEncryptedReport({}, {}, 7);
    expect(result.url).toBe(`https://example.test/report/${result.id}`);
  });
});

describe('getEncryptedMeta', () => {
  beforeEach(() => {
    store.clear();
    files.clear();
  });

  it('returns null for reports whose expiresAt is in the past', async () => {
    const id = 'past-id';
    store.set(`reports/${id}/meta.json`, {
      id,
      version: 3,
      encrypted: true,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    expect(await getEncryptedMeta(id)).toBeNull();
  });

  it('returns meta for live reports', async () => {
    const id = 'live-id';
    const meta = {
      id,
      version: 3,
      encrypted: true,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    store.set(`reports/${id}/meta.json`, meta);
    expect(await getEncryptedMeta(id)).toEqual(meta);
  });

  it('returns null when the meta object does not exist', async () => {
    expect(await getEncryptedMeta('ghost')).toBeNull();
  });
});

describe('createReport (screenshot extension handling)', () => {
  beforeEach(() => {
    store.clear();
    files.clear();
  });

  it('maps image MIME types to the expected file extension', async () => {
    const cases: Array<{ mimetype: string; expectExt: string }> = [
      { mimetype: 'image/png', expectExt: 'png' },
      { mimetype: 'image/gif', expectExt: 'gif' },
      { mimetype: 'image/webp', expectExt: 'webp' },
      { mimetype: 'image/jpeg', expectExt: 'jpg' },
      // Anything we don't recognise falls through to jpg. This is the
      // existing behaviour - pinning so a future refactor notices if
      // someone switches the default to octet-stream or similar.
      { mimetype: 'application/octet-stream', expectExt: 'jpg' },
    ];

    for (const { mimetype, expectExt } of cases) {
      store.clear();
      files.clear();
      const result = await createReport(baseInput(), [
        { buffer: Buffer.from('x'), mimetype, originalname: 'shot' },
      ]);
      expect(files.has(`reports/${result.id}/screenshot.${expectExt}`)).toBe(true);
    }
  });

  it('numbers screenshots from the second one (screenshot, screenshot2, screenshot3)', async () => {
    const result = await createReport(baseInput(), [
      { buffer: Buffer.from('a'), mimetype: 'image/png', originalname: 'a' },
      { buffer: Buffer.from('b'), mimetype: 'image/png', originalname: 'b' },
      { buffer: Buffer.from('c'), mimetype: 'image/png', originalname: 'c' },
    ]);
    expect(files.has(`reports/${result.id}/screenshot.png`)).toBe(true);
    expect(files.has(`reports/${result.id}/screenshot2.png`)).toBe(true);
    expect(files.has(`reports/${result.id}/screenshot3.png`)).toBe(true);
  });

  it('stores screenshotKeys on the meta record in upload order', async () => {
    const result = await createReport(baseInput(), [
      { buffer: Buffer.from('a'), mimetype: 'image/png', originalname: 'a' },
      { buffer: Buffer.from('b'), mimetype: 'image/gif', originalname: 'b' },
    ]);
    const meta = store.get(`reports/${result.id}/meta.json`) as { screenshotKeys: string[] };
    expect(meta.screenshotKeys).toEqual([
      `reports/${result.id}/screenshot.png`,
      `reports/${result.id}/screenshot2.gif`,
    ]);
  });
});

describe('cleanupExpired', () => {
  beforeEach(() => {
    store.clear();
    files.clear();
  });

  it('deletes expired reports and leaves live ones alone', async () => {
    const now = Date.now();
    store.set('reports/live/meta.json', {
      id: 'live',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 86_400_000).toISOString(),
      screenshotKeys: [],
      skeletonName: 'a', spineVersion: '4.2',
      worstRiLevel: 'low', worstCiLevel: 'low',
      totalAnimations: 1, fileHashes: [],
    });
    store.set('reports/live/analysis.json', { ok: true });

    store.set('reports/dead/meta.json', {
      id: 'dead',
      createdAt: new Date(now - 30 * 86_400_000).toISOString(),
      expiresAt: new Date(now - 86_400_000).toISOString(),
      screenshotKeys: [],
      skeletonName: 'a', spineVersion: '4.2',
      worstRiLevel: 'low', worstCiLevel: 'low',
      totalAnimations: 1, fileHashes: [],
    });
    store.set('reports/dead/analysis.json', { ok: true });

    const deleted = await cleanupExpired();
    expect(deleted).toBe(1);
    expect(store.has('reports/live/meta.json')).toBe(true);
    expect(store.has('reports/live/analysis.json')).toBe(true);
    expect(store.has('reports/dead/meta.json')).toBe(false);
    expect(store.has('reports/dead/analysis.json')).toBe(false);
  });
});
