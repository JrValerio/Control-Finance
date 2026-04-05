# Document Import Semantic Incident Runbook

## Scope

Operational response for a single incident boundary in document import:

- semantic regression on import classification/normalization for `source=transactions_import`.

This runbook is intentionally narrow for AUD-020 and does not define a global incident policy.

## Incident Trigger (single scenario)

Open incident when all conditions below are observed in the same time window (5-15 minutes):

1. sustained increase of `parse_failure` events;
2. stable or increased `parse_attempt` volume;
3. drop in `sensitive_mutation_success`.

Signal contract inherited from AUD-013:

- metric: `document_financial_observability_events_total{source,signal,reason_class}`
- source: `transactions_import`
- signals: `parse_attempt`, `parse_failure`, `sensitive_mutation_success`

## Detection Queries (PromQL)

Use a 15-minute baseline and compare with current 5-minute rate:

```promql
sum(rate(document_financial_observability_events_total{source="transactions_import",signal="parse_failure"}[5m]))
```

```promql
sum(rate(document_financial_observability_events_total{source="transactions_import",signal="parse_attempt"}[5m]))
```

```promql
sum(rate(document_financial_observability_events_total{source="transactions_import",signal="sensitive_mutation_success"}[5m]))
```

Suggested gating heuristic for this slice:

- `parse_failure` rate >= 2x local baseline while
- `parse_attempt` is not near zero and
- `sensitive_mutation_success` rate falls materially (>30% vs local baseline).

## First 15 Minutes Checklist

1. Confirm the three-signal pattern above in Grafana Explore.
2. Record UTC start time and query snapshots.
3. Identify dominant `reason_class` in `parse_failure` (`validation`, `limit`, `internal`, `none`).
4. Validate API health (`GET /health`) and ingestion visibility (`/metrics`).
5. Check release/change timeline for parser/classification/rules updates.

## Triage Decision

- `P1`: broad import failure with user-visible blocking in critical journey.
- `P2`: degradation with partial fallback/continuity.
- `P3`: temporary spike auto-recovered with low user impact.

## Mitigation Path (minimal)

1. If regression is tied to recent rule/config change, rollback that change first.
2. If tied to recent release and impact persists, rollback API to last stable revision.
3. Keep incident monitor window for 30 minutes after mitigation.
4. Confirm recovery pattern:
   - `parse_failure` trending to baseline;
   - `sensitive_mutation_success` recovering;
   - `parse_attempt` stable.

## Closure Criteria

- Trigger condition no longer active for 30 minutes.
- Health checks stable.
- Recovery trend confirmed in all three signals.
- Incident evidence file updated.

## Evidence Template

```md
Incident Start (UTC):
Severity (P1/P2/P3):
Trigger Pattern Confirmed (yes/no):
Dominant reason_class:
Impact Scope:
Mitigation Applied:
Rollback (yes/no):
Recovery Time:
Owner:
Post-Incident Notes:
```