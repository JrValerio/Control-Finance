# Release Production Checklist

## Objective
Standardize post-release verification for API + Web in production, with traceable and repeatable steps.

## 1. Deploy Verification (Infrastructure)

### API (Render)
- [ ] Confirm active commit equals release commit (example: `f4f7a4e`).
- [ ] Check startup logs:
  - [ ] `runMigrations()` executed successfully.
  - [ ] No duplicate migration errors.
  - [ ] `schema_migrations` updated when release includes new migrations.
  - [ ] No Postgres connection errors.
- [ ] Confirm `GET /health` returns:
  - [ ] `ok: true`
  - [ ] expected `version` and `commit`
  - [ ] `buildTimestamp` filled
  - [ ] `uptimeSeconds` greater than zero
  - [ ] `db.status = "ok"` with `latencyMs` reported
- [ ] Validate required environment variables:
  - [ ] `DATABASE_URL`
  - [ ] `JWT_SECRET`
  - [ ] `CORS_ORIGIN`
  - [ ] `TRUST_PROXY=1`
  - [ ] `APP_BUILD_TIMESTAMP` (set in Render deploy environment)
  - [ ] `BILLING_PAST_DUE_GRACE_DAYS` (optional, default `3`)

### Web (Vercel)
- [ ] Confirm latest deployment is from `main`.
- [ ] Confirm `VITE_API_URL` points to the public Render API URL.
- [ ] Confirm login/register requests do not fallback to localhost.
- [ ] Confirm no CORS 403 errors in browser console.

### Observability Worker (Render Alloy)
- [ ] Confirm Alloy worker latest deploy is running.
- [ ] Validate required Worker environment variables:
  - [ ] `API_HOST`
  - [ ] `ENVIRONMENT`
  - [ ] `SCRAPE_INTERVAL`
  - [ ] `SCRAPE_TIMEOUT`
  - [ ] `METRICS_AUTH_TOKEN`
  - [ ] `GRAFANA_CLOUD_REMOTE_WRITE_URL`
  - [ ] `GRAFANA_CLOUD_USERNAME`
  - [ ] `GRAFANA_CLOUD_API_KEY`
- [ ] Confirm Worker logs do not show repeated 401/403 scraping `/metrics`.
- [ ] Confirm Grafana ingestion query returns samples:
  - [ ] `sum(rate(http_requests_total{job="control-finance-api"}[5m]))`

## 2. Functional Smoke Test (Ephemeral User)

Recommended sequence:

```text
register -> login -> budgets/transactions -> logout
```

Minimum flow:
- [ ] `POST /auth/register`
- [ ] `POST /auth/login`
- [ ] `GET /transactions`
- [ ] Create transaction
- [ ] Export CSV
- [ ] Soft delete + restore
- [ ] Logout

Optional automated smoke (categories v2 contract):
- [ ] Run `scripts/smoke-categories-v2.ps1 -BaseUrl "https://<api-host>"` and keep output as evidence.

## 3. Post-release Monitoring (15-30 min)

Monitor API logs for:
- [ ] `/auth/login`
- [ ] `/auth/register`
- [ ] `/transactions`
- [ ] `/transactions/export.csv`

Confirm:
- [ ] No 5xx errors.
- [ ] No unexpected 429 spike (rate limit).
- [ ] No CORS errors.
- [ ] Dashboard `Control Finance API - Minimum Observability` displays fresh data.
- [ ] Alert rules loaded from `docs/observability/alerts/control-finance-api-alerts.yaml`.

## 4. Observability Baseline (Availability)

Reference:
- [ ] [`docs/observability/slo.md`](../observability/slo.md) reviewed for current SLI/SLO definitions.
- [ ] [`docs/observability/grafana-cloud.md`](../observability/grafana-cloud.md) reviewed for metrics ingestion and alerting setup.
- [ ] [`docs/runbooks/api-5xx-incident.md`](./api-5xx-incident.md) reviewed for incident response.

### SLI
- [ ] Availability SLI is based on `GET /health` success rate (`HTTP 200`).
- [ ] 5xx SLI is based on `http_requests_total{status="5xx"}` ratio.

### SLO
- [ ] Target availability: `>= 99.5%` over a rolling 30-day window.
- [ ] Error budget acknowledged: `216 minutes` per 30 days.
- [ ] Target 5xx ratio: `<= 1.0%` over a rolling 30-day window.

### UptimeRobot Baseline
- [ ] Monitor type: HTTP(s)
- [ ] URL: `https://control-finance-react-tailwind.onrender.com/health`
- [ ] Interval: 1 minute
- [ ] Timeout: 10 seconds
- [ ] Alert trigger: 2 consecutive failures

### Metric Contract Verification (Grafana Explore)
- [ ] Request rate by status class:
  - [ ] `sum by (status) (rate(http_requests_total{job="control-finance-api"}[5m]))`
- [ ] Critical endpoint latency series:
  - [ ] `sum by (endpoint) (rate(http_request_latency_ms_count{job="control-finance-api"}[5m]))`
- [ ] P95 latency for `/transactions`:
  - [ ] `histogram_quantile(0.95, sum by (le) (rate(http_request_latency_ms_bucket{job="control-finance-api", endpoint="/transactions"}[5m])))`

### Alert Severity Mapping
- [ ] P1: `/health` unavailable for > 2 minutes.
- [ ] P1: `5xx` absolute rate above baseline threshold for sustained window.
- [ ] P2: recurring degradation, elevated `5xx` ratio, or partial service impact.
- [ ] P3: informational/low-impact alert.

## 5. Incident Severity and Escalation

Severity criteria:
- **P1 (Critical):** production unavailable, sustained 5xx spike, auth failure for most users, or data integrity risk.
- **P2 (High):** major feature degraded with workaround, localized 5xx increase, or repeated import/export failures.
- **P3 (Medium/Low):** minor degradation, UI regressions without data-loss risk, intermittent non-critical issues.

Escalation flow:
1. Capture `requestId`, timestamp, impacted endpoint, and user impact scope.
2. Classify severity (P1/P2/P3) and notify owner on-call.
3. For P1: start rollback decision within 15 minutes.
4. For P2: create mitigation plan and keep monitoring window active.
5. For P3: register issue and schedule fix in next planned iteration.

## 6. Rollback Plan

If critical issue happens:
1. Identify last stable commit.
2. In Render, deploy that commit manually.
3. Re-check `GET /health`.
4. Record incident in runbook.

## 7. Runbook Entry (Per Release)

```md
Release: vX.Y.Z
Commit API:
Commit Web:
Date:
Owner:
Smoke test completed: yes/no
Ephemeral user used: yes/no
30 min monitoring completed: yes/no
Rollback required: yes/no
Notes:
```

## 8. Evidences (Per Release)

> Copy this block for each new release and keep history at the end of this file.

```md
Release: vX.Y.Z
Date:
Owner:

PR release:
Tag:
GitHub Release:
Commit main:
Commit runtime (`/health.commit`):

Render deploy (link):
Vercel deploy (link):
Output `/health` (json):
Smoke executed: yes/no
Monitoring 15-30 min: ok/not ok
Rollback needed: yes/no
Observations:
```

### Evidence Template (Copy/Paste for New Releases)

Use this structure for each new release:

```md
### Evidences - vX.Y.Z (YYYY-MM-DD)

#### Git Integrity
- main HEAD: `<short_sha>`
- tag `vX.Y.Z` -> `<short_sha>` (annotated)

#### Production Smoke (Render)
Base: `https://<api-host>`

##### /health
- Status: `200`
- version: `<x.y.z>`
- commit: `<full_sha>`
- buildTimestamp: `<ISO-8601 | unknown>`
- Result: `OK`

##### /metrics (no auth)
- Status: `403`
- Result: `Protected as expected`

#### Conclusion
Production is aligned with `origin/main` and `vX.Y.Z` (version + commit).
Observability endpoints are behaving as expected.
```

Reusable repro commands:

```powershell
$api='https://<api-host>'

# health
$h = Invoke-RestMethod "$api/health"
$h | ConvertTo-Json -Depth 5

# metrics (negative control)
try {
  Invoke-WebRequest "$api/metrics" -TimeoutSec 15 | Out-Null
  "metrics(no-auth)=200"
} catch {
  "metrics(no-auth)=$($_.Exception.Response.StatusCode.value__)"
}
```

### Evidences - v1.13.1 (2026-02-20)

#### Git Integrity
- main HEAD: `b6e32de`
- tag `v1.13.1` -> `b6e32de` (annotated)

#### Production Smoke (Render)
Base: `https://control-finance-react-tailwind.onrender.com`

##### /health
- Status: `200`
- version: `1.13.1`
- commit: `b6e32defa94994acea4e143312e404a7c292a1b4`
- buildTimestamp: `2026-02-20T18:30:00Z`
- Result: OK

##### /metrics (no auth)
- Status: `403`
- Result: Protected as expected

#### Repro Commands (PowerShell)

```powershell
$api='https://control-finance-react-tailwind.onrender.com'

# health
$h = Invoke-RestMethod "$api/health"
$h | ConvertTo-Json -Depth 5

# metrics (negative control)
try {
  Invoke-WebRequest "$api/metrics" -TimeoutSec 15 | Out-Null
  "metrics(no-auth)=200"
} catch {
  "metrics(no-auth)=$($_.Exception.Response.StatusCode.value__)"
}
```

#### Conclusion
Production is aligned with `origin/main` and `v1.13.1` (version + commit).
Observability endpoints are behaving as expected.

## 9. Suggested Operational Sequence

For each release:
1. Open and merge PR.
2. Ensure CI is green.
3. Create tag and GitHub Release.
4. Deploy API and Web.
5. Execute this checklist.
6. Monitor for at least 30 minutes.
