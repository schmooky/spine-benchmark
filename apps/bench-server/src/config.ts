/**
 * Environment configuration. See .env.example for documentation.
 *
 * STORAGE_MODE picks the run-row backend: postgres | mongo | memory.
 * memory runs without any external storage (runs live in process memory) -
 * meant for local development and CI smoke tests only.
 */

export type StorageMode = "postgres" | "mongo" | "memory";

function storageMode(): StorageMode {
  const raw = (process.env.STORAGE_MODE || "postgres").toLowerCase();
  if (raw === "memory") return "memory";
  if (raw === "mongo" || raw === "mongodb") return "mongo";
  return "postgres";
}

export const config = {
  port: Number(process.env.PORT || "8787"),
  storageMode: storageMode(),

  // Connection string for the chosen backend:
  //   postgres://user:pass@host:5432/spinebench
  //   mongodb://user:pass@host:27017/spinebench?authSource=admin
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
