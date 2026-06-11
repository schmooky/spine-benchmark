import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { RunCapture } from "./types.js";

/**
 * Full per-frame captures go to S3 under captures/<runId>.json - they are
 * big and only read when a report is opened with ?include=capture.
 * STORAGE_MODE=memory keeps them in a Map for local dev.
 */

interface CaptureStore {
  healthy(): Promise<boolean>;
  put(runId: string, capture: RunCapture): Promise<string>;
  get(key: string): Promise<RunCapture | null>;
}

class S3CaptureStore implements CaptureStore {
  private client = new S3Client({
    endpoint: config.s3.endpoint,
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
    forcePathStyle: true,
  });

  async healthy(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: config.s3.bucket }));
      return true;
    } catch (err) {
      logger.warn({ err }, "s3 health check failed");
      return false;
    }
  }

  async put(runId: string, capture: RunCapture): Promise<string> {
    const key = `captures/${runId}.json`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: JSON.stringify(capture),
        ContentType: "application/json",
      }),
    );
    return key;
  }

  async get(key: string): Promise<RunCapture | null> {
    try {
      const r = await this.client.send(
        new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }),
      );
      const body = await r.Body?.transformToString();
      return body ? (JSON.parse(body) as RunCapture) : null;
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }
}

class MemoryCaptureStore implements CaptureStore {
  private blobs = new Map<string, RunCapture>();

  async healthy(): Promise<boolean> {
    return true;
  }
  async put(runId: string, capture: RunCapture): Promise<string> {
    const key = `captures/${runId}.json`;
    this.blobs.set(key, capture);
    return key;
  }
  async get(key: string): Promise<RunCapture | null> {
    return this.blobs.get(key) ?? null;
  }
}

export const captureStore: CaptureStore =
  config.storageMode === "memory" ? new MemoryCaptureStore() : new S3CaptureStore();
