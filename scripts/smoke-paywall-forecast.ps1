<#
.SYNOPSIS
  Smoke test for paywall enforcement and forecast engine.

.DESCRIPTION
  Tests three access tiers against /forecasts endpoints:

    1. Unauthenticated        -> 401  (auth guard)
    2. Active trial user      -> 200  (trial gate passes)
    3. Expired trial user     -> 402  (paywall blocks -- requires -DbConnectionString)

  Steps 1 and 2 run against any environment with no side effects
  (the registered user persists but does not affect other users).

  Step 3 requires a Postgres connection string to expire the trial
  via SQL. Without it the step is skipped with a [SKIP] notice.

  Compatible with PowerShell 5.1+. No gh CLI required.

.PARAMETER BaseUrl
  API base URL. Default: production.

.PARAMETER DbConnectionString
  Optional. Postgres connection string for the 402 step.
  Example: "Host=localhost;Port=5432;Database=control_finance;Username=postgres;Password=secret"
  Used only to run: UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day'

.PARAMETER PsqlPath
  Path to psql.exe. Default: C:\Program Files\PostgreSQL\16\bin\psql.exe

.EXAMPLE
  # Steps 1+2 only (no DB)
  .\scripts\smoke-paywall-forecast.ps1 -BaseUrl "https://your-api.onrender.com"

  # All 3 steps (with DB)
  .\scripts\smoke-paywall-forecast.ps1 `
    -BaseUrl "https://your-api.onrender.com" `
    -DbConnectionString "postgresql://user:pass@host/db"
#>

param(
  [string]$BaseUrl = "https://control-finance-react-tailwind.onrender.com",
  [string]$DbConnectionString = "",
  [string]$PsqlPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
)

$ErrorActionPreference = "Stop"

$runId    = [guid]::NewGuid().ToString("N").Substring(0, 10)
$email    = "smoke-paywall-$runId@controlfinance.dev"
$password = "SmokePass#$runId"
$passed   = 0
$failed   = 0
$skipped  = 0

Write-Host ""
Write-Host "=== Smoke Test: Paywall + Forecast ===" -ForegroundColor Cyan
Write-Host "RunId  : $runId"
Write-Host "BaseUrl: $BaseUrl"
Write-Host "Email  : $email"
if ($DbConnectionString) {
  Write-Host "DB     : (provided -- 402 step enabled)"
} else {
  Write-Host "DB     : (not provided -- 402 step will be skipped)"
}
Write-Host ""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Pass([string]$step) {
  Write-Host "[PASS] $step" -ForegroundColor Green
  $script:passed++
}

function Fail([string]$step, [string]$detail = "") {
  Write-Host "[FAIL] $step" -ForegroundColor Red
  if ($detail) { Write-Host "       $detail" -ForegroundColor Red }
  $script:failed++
}

function Skip([string]$step, [string]$reason = "") {
  Write-Host "[SKIP] $step" -ForegroundColor Yellow
  if ($reason) { Write-Host "       $reason" -ForegroundColor Yellow }
  $script:skipped++
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    [string]$Body = ""
  )
  $uri = "$BaseUrl$Path"
  $allHeaders = @{ "Content-Type" = "application/json" }
  foreach ($k in $Headers.Keys) { $allHeaders[$k] = $Headers[$k] }

  try {
    $args = @{
      Method          = $Method
      Uri             = $uri
      Headers         = $allHeaders
      UseBasicParsing = $true
    }
    if ($Body) { $args["Body"] = $Body }
    $resp = Invoke-WebRequest @args
    return @{ StatusCode = [int]$resp.StatusCode; Body = $resp.Content | ConvertFrom-Json }
  } catch {
    $statusCode = 0
    $bodyText   = ""
    try {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $stream     = $_.Exception.Response.GetResponseStream()
      $reader     = New-Object System.IO.StreamReader($stream)
      $bodyText   = $reader.ReadToEnd()
    } catch { }
    $bodyObj = $null
    try { $bodyObj = $bodyText | ConvertFrom-Json } catch { }
    return @{ StatusCode = $statusCode; Body = $bodyObj; Raw = $bodyText }
  }
}

function Assert-Code([int]$got, [int]$want, [string]$step, [string]$extra = "") {
  if ($got -eq $want) {
    Pass $step
  } else {
    Fail $step ("Expected HTTP $want, got $got. $extra").Trim()
  }
}

# ---------------------------------------------------------------------------
# Step 1 -- Unauthenticated request -> 401
# ---------------------------------------------------------------------------

Write-Host "--- Step 1: Unauthenticated request ---"
$r1 = Invoke-Api "GET" "/forecasts/current"
Assert-Code $r1.StatusCode 401 "GET /forecasts/current (no auth) -> 401"

# ---------------------------------------------------------------------------
# Step 2 -- Active trial user
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "--- Step 2: Active trial user ---"

# 2a. Register
$r2a = Invoke-Api "POST" "/auth/register" -Body "{`"email`":`"$email`",`"password`":`"$password`"}"
Assert-Code $r2a.StatusCode 201 "POST /auth/register -> 201"
if ($r2a.StatusCode -ne 201) {
  Write-Host "       Cannot continue without a registered user." -ForegroundColor Red
  $script:failed += 5
  goto_summary
}

# 2b. Login
$r2b = Invoke-Api "POST" "/auth/login" -Body "{`"email`":`"$email`",`"password`":`"$password`"}"
Assert-Code $r2b.StatusCode 200 "POST /auth/login -> 200"

$token = $r2b.Body.token
if (-not $token) { $token = $r2b.Body.accessToken }
if (-not $token) {
  Fail "Extract token from login response"
  $script:failed += 4
  goto_summary
}
Pass "Extract token from login response"

$auth = @{ "Authorization" = "Bearer $token" }

# 2c. GET /me -> trialExpired: false
$r2c = Invoke-Api "GET" "/me" -Headers $auth
Assert-Code $r2c.StatusCode 200 "GET /me -> 200"
if ($r2c.Body.trialExpired -eq $false) {
  Pass "GET /me: trialExpired = false"
} else {
  Fail "GET /me: trialExpired" "Expected false, got $($r2c.Body.trialExpired)"
}
if ($r2c.Body.trialEndsAt) {
  Pass "GET /me: trialEndsAt is set ($($r2c.Body.trialEndsAt))"
} else {
  Fail "GET /me: trialEndsAt is null -- trial may not have been set on register"
}

# 2d. POST /forecasts/recompute -> 200 (trial gate passes)
$r2d = Invoke-Api "POST" "/forecasts/recompute" -Headers $auth
Assert-Code $r2d.StatusCode 200 "POST /forecasts/recompute (active trial) -> 200"
if ($r2d.StatusCode -eq 200 -and $r2d.Body.month) {
  Pass "POST /forecasts/recompute: response has month ($($r2d.Body.month))"
}

# 2e. GET /forecasts/current -> 200
$r2e = Invoke-Api "GET" "/forecasts/current" -Headers $auth
Assert-Code $r2e.StatusCode 200 "GET /forecasts/current (active trial) -> 200"

# ---------------------------------------------------------------------------
# Step 3 -- Expired trial -> 402 (requires DB)
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "--- Step 3: Expired trial user (402) ---"

if (-not $DbConnectionString) {
  Skip "POST /forecasts/recompute (expired trial) -> 402" `
       "Provide -DbConnectionString to enable this step."
  Skip "GET /forecasts/current (expired trial) -> 402" `
       "Provide -DbConnectionString to enable this step."
} elseif (-not (Test-Path $PsqlPath)) {
  Skip "POST /forecasts/recompute (expired trial) -> 402" `
       "psql not found at $PsqlPath. Set -PsqlPath to enable."
  Skip "GET /forecasts/current (expired trial) -> 402" ""
} else {
  # Expire the trial via psql
  $sql = "UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE email = '$email';"
  try {
    & $PsqlPath $DbConnectionString -c $sql | Out-Null
    Pass "SQL: expire trial_ends_at for $email"
  } catch {
    Fail "SQL: expire trial_ends_at" "$_"
    Skip "POST /forecasts/recompute (expired trial) -> 402" "SQL step failed"
    Skip "GET /forecasts/current (expired trial) -> 402" ""
    goto_summary
  }

  # 3a. POST /forecasts/recompute -> 402
  $r3a = Invoke-Api "POST" "/forecasts/recompute" -Headers $auth
  Assert-Code $r3a.StatusCode 402 "POST /forecasts/recompute (expired trial) -> 402"
  if ($r3a.StatusCode -eq 402 -and $r3a.Body.message) {
    Pass "402 body has message: $($r3a.Body.message)"
  }

  # 3b. GET /forecasts/current -> 402
  $r3b = Invoke-Api "GET" "/forecasts/current" -Headers $auth
  Assert-Code $r3b.StatusCode 402 "GET /forecasts/current (expired trial) -> 402"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

function goto_summary {}  # label target (no-op)
goto_summary

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ("  PASS: {0}  FAIL: {1}  SKIP: {2}" -f $passed, $failed, $skipped) -ForegroundColor $(if ($failed -gt 0) { "Red" } elseif ($skipped -gt 0) { "Yellow" } else { "Green" })
Write-Host "=======================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 }
exit 0
