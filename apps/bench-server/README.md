# @spine-benchmark/bench-server

Ingest + report API for device calibration runs. Hosted at
`https://spine-bench.schmooky.dev`. The runner client
(`apps/bench-runner`, hosted at `https://spine-run.schmooky.dev`) uploads a
finished benchmark here and receives a short 8-char run id.

## Storage

- **Postgres** (`bench_runs` table): one row per run - device info,
  per-scenario stats, summary. Schema is created on boot.
- **S3**: the full per-frame capture as `captures/<id>.json`.
- `STORAGE_MODE=memory` keeps everything in process memory: local dev only.

## Endpoints

| Method | Path | Purpose |
| ------ | ---- | ------- |
| GET | `/livez` | process is up (use as container liveness probe) |
| GET | `/healthz` | postgres + s3 reachable (readiness) |
| POST | `/api/runs` | ingest a finished run, returns `{ id, reportUrl }` |
| GET | `/api/runs` | recent runs (`?limit=50`) |
| GET | `/api/runs/:id` | run row; `?include=capture` merges the S3 capture |
| GET | `/r/:id` | human-readable HTML report |

## Run locally

```sh
cp .env.example .env            # fill in pg + s3, or:
STORAGE_MODE=memory npm run dev --workspace @spine-benchmark/bench-server
```

Logs are structured pino JSON on stdout; health probes log at trace level
so they don't drown real traffic.
