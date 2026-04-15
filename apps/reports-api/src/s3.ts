import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { config } from './config.js';

export const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
  forcePathStyle: true,
});

const BUCKET = config.s3.bucket;

/**
 * Upload a JSON object to S3 under the given key.
 */
export async function putJson(key: string, data: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    }),
  );
}

/**
 * Upload a binary buffer (screenshot, etc.) to S3.
 */
export async function putFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/**
 * Read a JSON object from S3.
 */
/**
 * Narrow an unknown error to an object with the AWS SDK shape we
 * actually care about. Duck-typed because importing the real
 * `@aws-sdk/client-s3` error classes for a `instanceof` check is
 * overkill for two fields.
 */
function isNotFoundError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404;
}

export async function getJson<T = unknown>(key: string): Promise<T | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await result.Body?.transformToString();
    return body ? (JSON.parse(body) as T) : null;
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

/**
 * Read a binary buffer from S3.
 */
export async function getBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const result = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) return null;
    return {
      buffer: Buffer.from(bytes),
      contentType: result.ContentType || 'application/octet-stream',
    };
  } catch (err) {
    if (isNotFoundError(err)) return null;
    throw err;
  }
}

/**
 * Delete a single object from S3.
 */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  );
}

/**
 * List all objects under a prefix.
 */
export async function listPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of result.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return keys;
}
