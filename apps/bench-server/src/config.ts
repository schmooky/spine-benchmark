/**
 * Environment configuration. See .env.example for documentation.
 *
 * STORAGE_MODE=memory runs without Postgres/S3 (runs live in process
 * memory) - meant for local development and CI smoke tests only.
 */

export type StorageMode = "postgres" | "memory";

function storageMode(): StorageMode {
  const raw = (process.env.STORAGE_MODE || "postgres").toLowerCase();
  return raw === "memory" ? "memory" : "postgres";
}

export const config = {
  port: Number(process.env.PORT || "8787"),
  storageMode: storageMode(),

  // Postgres connection string, e.g. postgres://user:pass@host:5432/spinebench
  databaseUrl: process.env.DATABASE_URL || "",

  // S3 / S3-compatible storage for full per-frame captures.
  s3: {
    endpoint: process.env.S3_ENDPOINT || "",
    region: process.env.S3_REGION || "ru-1",
    bucket: process.env.S3_BUCKET || "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },

  // Comma-separated list of allowed CORS origins for the runner client.
  // Default covers production runner + local dev.
  corsOrigins: (
    process.env.CORS_ORIGINS ||
    "https://spine-run.schmooky.dev,http://localhost:5190,http://localhost:5189"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  // Public base URL of this server, used in report links.
  publicUrl: process.env.PUBLIC_URL || "https://spine-bench.schmooky.dev",

  // Max accepted payload (full capture rides in the POST body).
  bodyLimit: process.env.BODY_LIMIT || "25mb",

  logLevel: process.env.LOG_LEVEL || "info",
};
