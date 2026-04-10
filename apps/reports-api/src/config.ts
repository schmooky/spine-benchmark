/**
 * Configuration loaded from environment variables.
 * See .env.example for documentation of each variable.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || '3001'),

  // S3 / S3-compatible storage (Timeweb S3, MinIO, AWS, etc.)
  s3: {
    endpoint: required('S3_ENDPOINT'),
    region: process.env.S3_REGION || 'ru-1',
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY_ID'),
    secretAccessKey: required('S3_SECRET_ACCESS_KEY'),
  },

  // Public base URL for generating share links.
  // In production this is the deployed reports-api URL.
  publicUrl: required('PUBLIC_URL'),

  // Report TTL in days. Reports older than this are eligible for cleanup.
  reportTtlDays: Number(process.env.REPORT_TTL_DAYS || '7'),

  // CORS origin for the benchmark frontend.
  corsOrigin: process.env.CORS_ORIGIN || '*',
};
