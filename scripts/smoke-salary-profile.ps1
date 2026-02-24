<#
.SYNOPSIS
  Smoke test for salary profile API and annual paywall behavior.

.DESCRIPTION
  Always runs the base flow:
    1. POST /auth/register
    2. POST /auth/login
    3. PUT /salary/profile
    4. GET /salary/profile

  Base expectation: for a fresh trial user, calculation.netAnnual and
  calculation.taxAnnual are numeric values.

  Optional flow (requires -DbConnectionString and psql):
    5. Expire trial in DB -> user falls back to free
    6. GET /salary/profile -> netAnnual/taxAnnual must be null
    7. Grant pro subscription in DB
    8. GET /salary/profile -> netAnnual/taxAnnual must be numeric again

  Every API call sends x-request-id and validates it is echoed back.

.PARAMETER BaseUrl
  API base URL. Default: production.

.PARAMETER GrossSalary
  gross_salary value used in PUT /salary/profile.

.PARAMETER Dependents
  dependents value used in PUT /salary/profile.

.PARAMETER PaymentDay
  payment_day value used in PUT /salary/profile.

.PARAMETER DbConnectionString
  Optional Postgres connection string for free/pro verification steps.
  Example: "postgresql://user:pass@host/db"

.PARAMETER PsqlPath
  Path to psql.exe when DbConnectionString is provided.

.EXAMPLE
  # Base smoke only (trial user should see annual values)
  .\scripts\smoke-salary-profile.ps1 -BaseUrl "https://your-api.onrender.com"

.EXAMPLE
  # Full smoke (trial -> free -> pro)
  .\scripts\smoke-salary-profile.ps1 `
    -BaseUrl "https://your-api.onrender.com" `
    -DbConnectionString "postgresql://user:pass@host/db"
#>

param(
  [string]$BaseUrl = "https://control-finance-react-tailwind.onrender.com",
  [double]$GrossSalary = 5000,
  [int]$Dependents = 1,
  [int]$PaymentDay = 5,
  [string]$DbConnectionString = "",
  [string]$PsqlPath = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
)

$ErrorActionPreference = "Stop"

$runId = [guid]::NewGuid().ToString("N").Substring(0, 10)
$email = "smoke-salary-$runId@controlfinance.dev"
$password = "SmokePass#$runId"
$requestSeq = 0

$passed = 0
$failed = 0
$skipped = 0

Write-Host ""
Write-Host "=== Smoke Test: Salary Profile + Annual Paywall ===" -ForegroundColor Cyan
Write-Host "RunId  : $runId"
Write-Host "BaseUrl: $BaseUrl"
Write-Host "Email  : $email"
if ($DbConnectionString) {
  Write-Host "DB     : provided (free/pro checks enabled)"
} else {
  Write-Host "DB     : not provided (free/pro checks skipped)"
}
Write-Host ""

function Pass([string]$step) {
  Write-Host "[PASS] $step" -ForegroundColor Green
  $script:passed++
}

function Fail([string]$step, [string]$detail = "") {
  Write-Host "[FAIL] $step" -ForegroundColor Red
  if ($detail) {
    Write-Host "       $detail" -ForegroundColor Red
  }
  $script:failed++
}

function Skip([string]$step, [string]$reason = "") {
  Write-Host "[SKIP] $step" -ForegroundColor Yellow
  if ($reason) {
    Write-Host "       $reason" -ForegroundColor Yellow
  }
  $script:skipped++
}

# no-op marker used to short-circuit to summary section
function New-RequestId([string]$label) {
  $script:requestSeq++
  return "smoke-salary-$runId-$($script:requestSeq)-$label"
}

function Get-HeaderValue($headers, [string]$name) {
  if (-not $headers) { return "" }

  try {
    $direct = $headers[$name]
    if ($direct) { return [string]$direct }
  } catch { }

  try {
    foreach ($key in $headers.Keys) {
      if ([string]$key -ieq $name) {
        return [string]$headers[$key]
      }
    }
  } catch { }

  return ""
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Headers = @{},
    $Body = $null,
    [string]$RequestId = ""
  )

  $rid = if ($RequestId) { $RequestId } else { New-RequestId "auto" }
  $uri = "$BaseUrl$Path"

  $allHeaders = @{
    "Content-Type" = "application/json"
    "x-request-id" = $rid
  }
  foreach ($k in $Headers.Keys) {
    $allHeaders[$k] = $Headers[$k]
  }

  try {
    $reqArgs = @{
      Method          = $Method
      Uri             = $uri
      Headers         = $allHeaders
      UseBasicParsing = $true
    }
    if ($null -ne $Body) {
      $reqArgs["Body"] = $Body | ConvertTo-Json -Depth 8
    }

    $resp = Invoke-WebRequest @reqArgs

    $bodyObj = $null
    if ($resp.Content) {
      try { $bodyObj = $resp.Content | ConvertFrom-Json } catch { }
    }

    return @{
      StatusCode        = [int]$resp.StatusCode
      Body              = $bodyObj
      Raw               = $resp.Content
      RequestIdSent     = $rid
      RequestIdReceived = Get-HeaderValue $resp.Headers "x-request-id"
    }
  } catch {
    $statusCode = 0
    $rawBody = ""
    $responseHeaders = $null

    try {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $responseHeaders = $_.Exception.Response.Headers
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $rawBody = $reader.ReadToEnd()
    } catch { }

    $bodyObj = $null
    if ($rawBody) {
      try { $bodyObj = $rawBody | ConvertFrom-Json } catch { }
    }

    return @{
      StatusCode        = $statusCode
      Body              = $bodyObj
      Raw               = $rawBody
      RequestIdSent     = $rid
      RequestIdReceived = Get-HeaderValue $responseHeaders "x-request-id"
    }
  }
}

function Assert-Code($resp, [int]$expected, [string]$step) {
  if ($resp.StatusCode -eq $expected) {
    Pass "$step -> HTTP $expected"
  } else {
    $raw = if ($resp.Raw) { $resp.Raw } else { "(empty body)" }
    Fail "$step -> HTTP $expected" "Got HTTP $($resp.StatusCode). Body: $raw"
  }
}

function Assert-RequestIdEcho($resp, [string]$step) {
  if (-not $resp.RequestIdReceived) {
    Fail "$step request-id echo" "Response missing x-request-id header."
    return
  }

  if ($resp.RequestIdReceived -ne $resp.RequestIdSent) {
    Fail "$step request-id echo" "Sent '$($resp.RequestIdSent)', received '$($resp.RequestIdReceived)'."
    return
  }

  Pass "$step request-id echo"
}

function Assert-AnnualIsNumber($resp, [string]$step) {
  if (-not $resp.Body -or -not $resp.Body.calculation) {
    Fail $step "Response body missing calculation object."
    return
  }

  $netAnnual = $resp.Body.calculation.netAnnual
  $taxAnnual = $resp.Body.calculation.taxAnnual

  $netIsNumber = $netAnnual -is [int] -or $netAnnual -is [long] -or $netAnnual -is [double] -or $netAnnual -is [decimal]
  $taxIsNumber = $taxAnnual -is [int] -or $taxAnnual -is [long] -or $taxAnnual -is [double] -or $taxAnnual -is [decimal]

  if ($netIsNumber -and $taxIsNumber -and [double]$netAnnual -gt 0) {
    Pass $step
  } else {
    Fail $step "Expected numeric annual fields > 0. netAnnual=$netAnnual taxAnnual=$taxAnnual"
  }
}

function Assert-AnnualIsNull($resp, [string]$step) {
  if (-not $resp.Body -or -not $resp.Body.calculation) {
    Fail $step "Response body missing calculation object."
    return
  }

  $netAnnual = $resp.Body.calculation.netAnnual
  $taxAnnual = $resp.Body.calculation.taxAnnual

  if ($null -eq $netAnnual -and $null -eq $taxAnnual) {
    Pass $step
  } else {
    Fail $step "Expected null annual fields. netAnnual=$netAnnual taxAnnual=$taxAnnual"
  }
}

function Invoke-Psql([string]$sql, [string]$step) {
  if (-not (Test-Path $PsqlPath)) {
    Fail $step "psql not found at '$PsqlPath'."
    return $false
  }

  try {
    & $PsqlPath $DbConnectionString -v ON_ERROR_STOP=1 -c $sql | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "psql exited with code $LASTEXITCODE"
    }
    Pass $step
    return $true
  } catch {
    Fail $step "$_"
    return $false
  }
}

Write-Host "--- Base flow (trial user) ---"

$rRegister = Invoke-Api -Method "POST" -Path "/auth/register" -Body @{
  email = $email
  password = $password
} -RequestId (New-RequestId "register")
Assert-Code $rRegister 201 "POST /auth/register"
Assert-RequestIdEcho $rRegister "POST /auth/register"

if ($rRegister.StatusCode -eq 201) {
  $rLogin = Invoke-Api -Method "POST" -Path "/auth/login" -Body @{
    email = $email
    password = $password
  } -RequestId (New-RequestId "login")
  Assert-Code $rLogin 200 "POST /auth/login"
  Assert-RequestIdEcho $rLogin "POST /auth/login"

  $token = $null
  if ($rLogin.Body) {
    $token = $rLogin.Body.token
    if (-not $token) { $token = $rLogin.Body.accessToken }
  }

  if ($rLogin.StatusCode -eq 200 -and $token) {
    Pass "Extract token from login response"

    $auth = @{ "Authorization" = "Bearer $token" }

    $rPut = Invoke-Api -Method "PUT" -Path "/salary/profile" -Headers $auth -Body @{
      gross_salary = $GrossSalary
      dependents = $Dependents
      payment_day = $PaymentDay
    } -RequestId (New-RequestId "put-profile")
    Assert-Code $rPut 200 "PUT /salary/profile"
    Assert-RequestIdEcho $rPut "PUT /salary/profile"
    if ($rPut.StatusCode -eq 200) {
      Assert-AnnualIsNumber $rPut "PUT /salary/profile (trial): annual fields are numeric"
    }

    $rGetTrial = Invoke-Api -Method "GET" -Path "/salary/profile" -Headers $auth -RequestId (New-RequestId "get-profile-trial")
    Assert-Code $rGetTrial 200 "GET /salary/profile (trial)"
    Assert-RequestIdEcho $rGetTrial "GET /salary/profile (trial)"
    if ($rGetTrial.StatusCode -eq 200) {
      Assert-AnnualIsNumber $rGetTrial "GET /salary/profile (trial): annual fields are numeric"
    }

    Write-Host ""
    Write-Host "--- Optional flow (free/pro) ---"

    if (-not $DbConnectionString) {
      Skip "GET /salary/profile (free): annual fields null" "Provide -DbConnectionString."
      Skip "GET /salary/profile (pro): annual fields numeric" "Provide -DbConnectionString."
    } else {
      $safeEmail = $email.Replace("'", "''")

      $trialExpiredOk = Invoke-Psql `
        -step "SQL: expire trial for smoke user" `
        -sql "UPDATE users SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE email = '$safeEmail';"

      if (-not $trialExpiredOk) {
        Skip "GET /salary/profile (free): annual fields null" "Could not expire trial."
        Skip "GET /salary/profile (pro): annual fields numeric" "Could not expire trial."
      } else {
        $rMe = Invoke-Api -Method "GET" -Path "/me" -Headers $auth -RequestId (New-RequestId "me-after-expire")
        Assert-Code $rMe 200 "GET /me (after trial expiry)"
        Assert-RequestIdEcho $rMe "GET /me (after trial expiry)"
        if ($rMe.StatusCode -eq 200) {
          if ($rMe.Body.trialExpired -eq $true) {
            Pass "GET /me: trialExpired = true"
          } else {
            Fail "GET /me: trialExpired = true" "Got trialExpired=$($rMe.Body.trialExpired)"
          }
        }

        $rGetFree = Invoke-Api -Method "GET" -Path "/salary/profile" -Headers $auth -RequestId (New-RequestId "get-profile-free")
        Assert-Code $rGetFree 200 "GET /salary/profile (free)"
        Assert-RequestIdEcho $rGetFree "GET /salary/profile (free)"
        if ($rGetFree.StatusCode -eq 200) {
          Assert-AnnualIsNull $rGetFree "GET /salary/profile (free): annual fields are null"
        }

        $cancelActiveSubSql = @"
UPDATE subscriptions
SET status = 'canceled'
WHERE user_id = (SELECT id FROM users WHERE email = '$safeEmail' LIMIT 1)
  AND status IN ('active', 'trialing', 'past_due');
"@

        $grantProSql = @"
WITH target_user AS (
  SELECT id AS user_id FROM users WHERE email = '$safeEmail' LIMIT 1
),
pro_plan AS (
  SELECT id AS plan_id FROM plans WHERE name = 'pro' AND is_active = true LIMIT 1
)
INSERT INTO subscriptions (user_id, plan_id, status)
SELECT target_user.user_id, pro_plan.plan_id, 'active'
FROM target_user
CROSS JOIN pro_plan;
"@

        $cancelOk = Invoke-Psql -step "SQL: cancel active subscriptions for smoke user" -sql $cancelActiveSubSql
        $grantOk = $false
        if ($cancelOk) {
          $grantOk = Invoke-Psql -step "SQL: grant pro subscription for smoke user" -sql $grantProSql
        }

        if (-not $grantOk) {
          Skip "GET /salary/profile (pro): annual fields numeric" "Could not grant pro subscription."
        } else {
          $rGetPro = Invoke-Api -Method "GET" -Path "/salary/profile" -Headers $auth -RequestId (New-RequestId "get-profile-pro")
          Assert-Code $rGetPro 200 "GET /salary/profile (pro)"
          Assert-RequestIdEcho $rGetPro "GET /salary/profile (pro)"
          if ($rGetPro.StatusCode -eq 200) {
            Assert-AnnualIsNumber $rGetPro "GET /salary/profile (pro): annual fields are numeric"
          }
        }
      }
    }
  } elseif ($rLogin.StatusCode -eq 200 -and -not $token) {
    Fail "Extract token from login response"
    Skip "PUT /salary/profile" "Missing token."
    Skip "GET /salary/profile (trial)" "Missing token."
    Skip "Optional free/pro checks" "Missing token."
  } else {
    Skip "PUT /salary/profile" "Login failed."
    Skip "GET /salary/profile (trial)" "Login failed."
    Skip "Optional free/pro checks" "Login failed."
  }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
$summaryColor = if ($failed -gt 0) { "Red" } elseif ($skipped -gt 0) { "Yellow" } else { "Green" }
Write-Host ("  PASS: {0}  FAIL: {1}  SKIP: {2}" -f $passed, $failed, $skipped) -ForegroundColor $summaryColor
Write-Host "=======================================" -ForegroundColor Cyan

if ($failed -gt 0) { exit 1 }
exit 0
