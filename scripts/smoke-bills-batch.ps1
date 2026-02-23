# Smoke Test para /bills/batch (Parcelamento)
# Uso:
#   .\scripts\smoke-bills-batch.ps1 -BaseUrl "https://sua-api.onrender.com" -Token "seu-jwt"

param (
  [Parameter(Mandatory=$true)]
  [string]$BaseUrl,

  [Parameter(Mandatory=$true)]
  [string]$Token
)

$ErrorActionPreference = "Stop"

function Invoke-API {
  param (
    [string]$Uri,
    [string]$Method,
    $Body,
    [switch]$StopOnError = $true
  )

  $Headers = @{
    "Content-Type"  = "application/json"
    "Authorization" = "Bearer $Token"
  }

  try {
    $JsonBody = if ($Body) { $Body | ConvertTo-Json -Depth 10 } else { $null }
    return Invoke-RestMethod -Uri "$BaseUrl$Uri" -Method $Method -Headers $Headers -Body $JsonBody
  } catch {
    if ($StopOnError) {
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            Write-Host "HTTP $status" -ForegroundColor Red
        }

        Write-Host "Erro em $Method $Uri" -ForegroundColor Red
        Write-Host $_.Exception.Message

        if ($_.Exception.Response) {
            $Stream = $_.Exception.Response.GetResponseStream()
            $Reader = New-Object System.IO.StreamReader($Stream)
            Write-Host ($Reader.ReadToEnd())
        }

        exit 1
    } else {
        throw $_
    }
  }
}

$rand = Get-Random
$titleBase = "SMOKE-PARCELAMENTO-$rand"
$today = Get-Date
$due1 = $today.ToString("yyyy-MM-dd")
$due2 = $today.AddMonths(1).ToString("yyyy-MM-dd")
$due3 = $today.AddMonths(2).ToString("yyyy-MM-dd")

Write-Host "1) Tentando criar 3 bills via /bills/batch..." -ForegroundColor Cyan

# Tentativa 1: Contrato camelCase (amount, dueDate)
$payload1 = @{
  bills = @(
    @{ title = "$titleBase (1/3)"; amount = 150.00; dueDate = $due1 }
    @{ title = "$titleBase (2/3)"; amount = 150.00; dueDate = $due2 }
    @{ title = "$titleBase (3/3)"; amount = 150.00; dueDate = $due3 }
  )
}

$result = $null

try {
    $result = Invoke-API -Uri "/bills/batch" -Method "POST" -Body $payload1 -StopOnError:$false
    Write-Host "   -> Sucesso com payload camelCase (amount, dueDate)" -ForegroundColor Gray
} catch {
    Write-Host "   -> Falha com camelCase (400?). Tentando fallback..." -ForegroundColor Yellow
    
    # Tentativa 2: Contrato alternativo (value, due_date)
    $payload2 = @{
      bills = @(
        @{ title = "$titleBase (1/3)"; value = 150.00; due_date = $due1 }
        @{ title = "$titleBase (2/3)"; value = 150.00; due_date = $due2 }
        @{ title = "$titleBase (3/3)"; value = 150.00; due_date = $due3 }
      )
    }
    # Aqui deixamos o erro explodir se falhar de novo (StopOnError default é true)
    $result = Invoke-API -Uri "/bills/batch" -Method "POST" -Body $payload2
    Write-Host "   -> Sucesso com payload alternativo (value, due_date)" -ForegroundColor Gray
}

$count = if ($result -is [array]) { $result.Count } elseif ($null -ne $result.count) { [int]$result.count } elseif ($null -ne $result.bills) { $result.bills.Count } else { 0 }

if ($count -ne 3) {
  Write-Error "Falha: esperado 3 bills criadas. Resposta: $($result | ConvertTo-Json -Depth 4)"
}

Write-Host "OK: 3 parcelas criadas via batch." -ForegroundColor Green
