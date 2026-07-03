// 0.3.0 = new calibration methodology: true GPU/CPU ms (timer query), coverage/
// overdraw, adaptive ms-knee ramp, live grading, resumable runs. Runs stored
// with clientVersion < "0.3.0" are LEGACY (fps/RI-CI only) - exclude them from
// the cost-model fit (filter clientVersion >= "0.3.0").
// 0.4.0 = full per-frame crawler measurement set captured per second (device-
// invariant cost drivers + CPU render-phase split + textures + GPU-timer data
// quality), measured with a honest config (spineProfile off, cpuMs uncorrupted).
// 0.4.1 = frameCpuMs (spine.update + render-side CPU): the honest compute cost.
// cpuMs alone undercounts Spine, whose computeWorldVertices + per-frame
// instruction rebuild land in the render phases (transformsMs / buildMs).
// 0.4.2 = ?mode=sweep isolation-sweep calibrator (kind:"sweep" scenarios):
// ramps one GPU cost driver at a time (fill/vertices/stencilMasks/
// renderTargets/filterPasses) and pairs its analytic driverValue with
// measured GPU/CPU ms, for fitting the crawler's placeholder gpuCost weights.
// 0.5.0 = measurement-audit remediation. Ramp bisection actually shrinks the
// pool (steps are labeled with what was ON SCREEN), sustain = fps AND gpu
// budget, skeleton parse cached (no multi-second spawn frames in the measured
// window), post-spawn frame excluded, GPU samples ingested exactly once
// (honest gpuFrames coverage), disjoint handling drops pending queries,
// displayHz=0 can no longer disable the ramp gates. Runs below 0.5.0 are
// QUARANTINED from the cost-model fit (see deviceFit MIN_FIT_VERSION).
export const CLIENT_VERSION = "0.5.0";

/** bench-server base URL. Dev points at the local memory-mode server. */
export const API_BASE: string =
  import.meta.env.VITE_BENCH_API ??
  (import.meta.env.DEV ? "http://localhost:8787" : "https://spine-bench.schmooky.dev");

/** Full run is ~5 minutes across all scenes; ?quick=<s> compresses it. */
export function totalSeconds(): number {
  const params = new URLSearchParams(location.search);
  if (params.has("quick")) return Number(params.get("quick")) || 24;
  return 300;
}
