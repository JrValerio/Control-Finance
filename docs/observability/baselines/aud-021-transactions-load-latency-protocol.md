# AUD-021 Transactions Load/Latency Protocol (v1)

## Scope

Single-flow baseline protocol for authenticated transactions listing:

- endpoint: `GET /transactions`
- query: `limit=20&offset=0`

This protocol is intentionally minimal for AUD-021 and does not define a global performance policy.

## Execution Target

- primary target in this slice: in-process API measurement (`apps/api`) using dedicated test harness.
- reproducibility target: same command in local and CI.

## Fixed Parameters

- warmup requests: `12`
- measurement requests: `60`
- concurrency: `6`
- auth mode: Bearer token from controlled test setup

## Official Command

```bash
npm -w apps/api run test:performance:aud-021
```

## Recorded Metrics

- `sampleSize`
- `p95Ms`
- `p99Ms`
- `avgMs`
- `minMs`
- `maxMs`
- `capturedAt`

## Evidence Shape

Baseline evidence file must include:

1. protocol parameters used
2. measured metrics (`p95Ms`, `p99Ms`, `avgMs`, `minMs`, `maxMs`)
3. execution context and timestamp
4. comparison rule for future runs

## Minimal Future Comparison Rule

Using the same protocol, consider potential regression when either:

- `p95Ms` > baseline `p95Ms` by more than 20%
- `p99Ms` > baseline `p99Ms` by more than 20%
