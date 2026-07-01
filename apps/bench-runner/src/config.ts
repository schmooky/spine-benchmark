export const CLIENT_VERSION = "0.2.0";

/** bench-server base URL. Dev points at the local memory-mode server. */
export const API_BASE: string =
  import.meta.env.VITE_BENCH_API ??
  (import.meta.env.DEV ? "http://localhost:8787" : "https://spine-bench.schmooky.dev");

/** Full run is ~10 minutes across all scenes; ?quick=<s> compresses it. */
export function totalSeconds(): number {
  const params = new URLSearchParams(location.search);
  if (params.has("quick")) return Number(params.get("quick")) || 24;
  return 600;
}
