# @spine-benchmark/bench-runner

Device calibration benchmark client, hosted at
`https://spine-run.schmooky.dev`. Give the link to someone, they tap
Start, the app plays the bundled Spine scenes for ~5 minutes with a timer
HUD, captures detailed frame metrics + device info, uploads everything to
bench-server (`https://spine-bench.schmooky.dev`) and shows an 8-char run
code. They send you the code; you open
`https://spine-bench.schmooky.dev/r/<code>`.

## Behavior

- **Scenarios** are generated from `public/spines/manifest.json`: per spine
  a solo pass and an instance ramp (1 -> 64 instances), then one mixed
  swarm. Total wall time divides evenly across scenarios.
- **Capture**: per-frame deltas per scenario (full capture, stored in S3),
  per-second rows (fps, p95, instances, RI/CI via the canonical
  metrics-impact-formula package), per-scenario aggregates and ramp steps.
- **Device info**: UA + UA-CH model, screen/DPR, cores, memory, GPU via
  WEBGL_debug_renderer_info, connection, battery.
- **Rerun guard**: completed run ids live in localStorage; revisiting shows
  "this device already ran the benchmark (id, date)". Rerunning is allowed
  and always issues a fresh id.
- Tab visibility is tracked: hidden time > 5 s flags the run as degraded.

## Swapping the spine set

Drop the new assets under `public/spines/<id>/` and edit
`public/spines/manifest.json`:

```json
{
  "spines": [
    { "id": "hero", "name": "Hero", "skel": "/spines/hero/hero.skel", "atlas": "/spines/hero/hero.atlas", "scale": 1 }
  ]
}
```

`.json` and binary `.skel` skeletons both work. No code changes needed.

## Dev

```sh
npm run dev:bench-runner              # http://localhost:5190
STORAGE_MODE=memory npm run dev:bench-server   # API at :8787
```

`?quick=18` on the URL shrinks the run to 18 seconds for testing.
`VITE_BENCH_API` overrides the API base at build time.
