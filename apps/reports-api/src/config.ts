/**
 * Configuration loaded from environment variables.
 * See .env.example for documentation of each variable.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[reports-api] WARNING: missing env var ${name} - S3 operations will fail until it is set`);
    return '';
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || '3000'),

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
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || '3000'}`,

  // Report TTL in days. Reports older than this are eligible for cleanup.
  reportTtlDays: Number(process.env.REPORT_TTL_DAYS || '7'),

  // CORS origin for the benchmark frontend.
  corsOrigin: process.env.CORS_ORIGIN || false,
};
