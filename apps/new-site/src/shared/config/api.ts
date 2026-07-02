/** bench-server base URL, for fetching the fitted cost-model coefficients. */
export const BENCH_API: string =
  (import.meta.env.VITE_BENCH_API as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:8787" : "https://spine-bench.schmooky.dev");
