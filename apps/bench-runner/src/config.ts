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
// 0.5.1 = correct scene features + robust sweeps. The 0.5.0 shakedown cohort
// captured heterogeneous game-scene features as "one representative spine x
// count" (valid only for a homogeneous stress pool), which fits to per-family
// R2 ~0.2; scene features are now the MEAN over EVERY spine so mean x instances
// = the true scene total. Also: sweeps skip on no-GPU-timer devices and survive
// weak GPUs (resolution cap + context-loss + choke guard) instead of aborting.
// 0.5.1 fixed only the NON-stress scenes: it wrongly assumed stress pools were
// homogeneous and left them on "one representative x count". But stress pools
// are a MIX of 9 symbols, so stress rows (a large share of the fit) still had
// wrong features.
// 0.5.2 = the SAME mean-over-all-spines walk now covers stress pools too (every
// pool up to 256 - all real scenes + all mobile stress - is walked in full;
// only huge desktop stress > 256 keeps the representative shortcut). Runs below
// 0.5.2 are quarantined - their stress features are still wrong.
export const CLIENT_VERSION = "0.5.2";

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
