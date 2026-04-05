# AUD-021 Transactions Load/Latency Baseline - 2026-04-04

## Objective

Register the first reproducible p95/p99 baseline for authenticated `GET /transactions` under controlled load.

## Protocol Reference

- [docs/observability/baselines/aud-021-transactions-load-latency-protocol.md](docs/observability/baselines/aud-021-transactions-load-latency-protocol.md)
- command: `npm -w apps/api run test:performance:aud-021`

## Execution Context

- target: in-process API (`apps/api` test harness)
- flow: authenticated `GET /transactions`
- query: `limit=20&offset=0`
- warmup requests: `12`
- measurement requests: `60`
- concurrency: `6`

## Measured Baseline (first run)

- sampleSize: `60`
- p95Ms: `113.5`
- p99Ms: `121.27`
- avgMs: `58.85`
- minMs: `27.15`
- maxMs: `121.27`
- capturedAt: `2026-04-05T00:39:52.758Z`

## Minimal Comparison Rule

In future runs, using the same protocol, treat as regression candidate when:

- `p95Ms` exceeds this baseline by more than 20%; or
- `p99Ms` exceeds this baseline by more than 20%.

## Notes

- This baseline is scoped to AUD-021 only.
- This slice does not introduce a global performance gate.
