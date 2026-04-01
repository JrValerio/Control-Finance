<#
.SYNOPSIS
  Smoke test ponta a ponta da fundacao CLT (Sprint 10).

.DESCRIPTION
  Executa o fluxo operacional da trilha CLT:
    1) bootstrap fiscal
    2) upload de holerite
    3) reprocessamento
    4) aprovacao em lote dos fatos
    5) geracao do income statement CLT

  Salva evidencias em pasta local dentro de tmp/.

.PARAMETER BaseUrl
  URL base da API.

.PARAMETER TaxYear
  Exercicio fiscal usado no smoke.

.PARAMETER Token
  Token JWT opcional. Se nao informado, o script cria usuario temporario e faz login.

.PARAMETER Email
  Email opcional para login/registro automatico quando Token nao for informado.

.PARAMETER LoginSecret
  Segredo opcional para login/registro automatico quando Token nao for informado.

.PARAMETER OutputDir
  Pasta base para evidencias (default: tmp).

.PARAMETER WhatIf
  Modo de pre-validacao: imprime etapas sem chamar API.
#>

param(
    [string]$BaseUrl = "https://control-finance-react-tailwind.onrender.com",
    [int]$TaxYear = 2026,
    [string]$Token = "",
    [string]$Email = "",
    [string]$LoginSecret = "",
    [string]$OutputDir = "tmp",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

$runId = "{0:yyyyMMdd-HHmmss}-{1}" -f (Get-Date), (Get-Random -Maximum 9999)
$artifactDir = Join-Path $OutputDir "smoke-clt-foundation-$runId"
$sampleCsvPath = Join-Path $artifactDir "holerite-clt-smoke.csv"
$checklistPath = Join-Path $artifactDir "checklist-s10-6.json"

$script:passed = 0
$script:failed = 0

function Pass([string]$message) {
    Write-Host "[PASS] $message" -ForegroundColor Green
    $script:passed++
}

function Fail([string]$message) {
    Write-Host "[FAIL] $message" -ForegroundColor Red
    $script:failed++
}

function Save-JsonArtifact {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        $Payload
    )

    $path = Join-Path $artifactDir $Name
    ($Payload | ConvertTo-Json -Depth 20) | Out-File -FilePath $path -Encoding utf8
}

function Invoke-Api {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Method,
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [hashtable]$Headers = @{},
        [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession = $null,
        $BodyObject = $null,
        [hashtable]$Form = $null
    )

    $uri = "$BaseUrl$Path"

    try {
        $invokeArgs = @{
            Method  = $Method
            Uri     = $uri
            Headers = $Headers
        }

        if ($null -ne $WebSession) {
            $invokeArgs.WebSession = $WebSession
        }

        if ($null -ne $Form) {
            $invokeArgs.Form = $Form
            $response = Invoke-WebRequest @invokeArgs
        }
        elseif ($null -ne $BodyObject) {
            $invokeArgs.ContentType = "application/json"
            $invokeArgs.Body = $BodyObject | ConvertTo-Json -Depth 20
            $response = Invoke-WebRequest @invokeArgs
        }
        else {
            $response = Invoke-WebRequest @invokeArgs
        }

        $json = $null
        if ($response.Content) {
            try {
                $json = $response.Content | ConvertFrom-Json
            }
            catch {
                $json = $null
            }
        }

        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Headers    = $response.Headers
            Raw        = $response.Content
            Json       = $json
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
            $errorDetails = "{0}`n{1}" -f $errorDetails, $_.ErrorDetails.Message
        }

        throw "Erro em $Method $Path`n$errorDetails"
    }
}

Write-Host ""
Write-Host "=== Smoke S10.6 - Fundacao CLT ===" -ForegroundColor Cyan
Write-Host "RunId   : $runId"
Write-Host "BaseUrl : $BaseUrl"
Write-Host "TaxYear : $TaxYear"
Write-Host ""

if ($WhatIf) {
    Write-Host "[WhatIf] Etapas que seriam executadas:" -ForegroundColor Yellow
    Write-Host "  1) Auth (token existente ou register/login temporario)"
    Write-Host "  2) GET /tax"
    Write-Host "  3) POST /tax/documents"
    Write-Host "  4) POST /tax/documents/:id/reprocess"
    Write-Host "  5) GET /tax/facts?taxYear=<ano>&reviewStatus=pending"
    Write-Host "  6) POST /tax/facts/bulk-review"
    Write-Host "  7) GET /tax/income-statement-clt/:taxYear"
    exit 0
}

if (-not (Get-Command Invoke-WebRequest).Parameters.ContainsKey("Form")) {
    throw "Este script precisa de PowerShell com suporte a -Form em Invoke-WebRequest (recomendado: PowerShell 7+)."
}

New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$sampleCsv = @(
    "Holerite"
    "Demonstrativo de Pagamento de Salario"
    "Empresa ACME LTDA"
    "CNPJ 12.345.678/0001-90"
    "Funcionario Joao da Silva"
    "CPF 123.456.789-00"
    "Competencia 03/2025"
    "001 SALARIO BASE 8.500,00 0,00"
    "998 INSS 0,00 876,00"
    "999 IRRF 0,00 423,35"
    "Total de Proventos 8.500,00"
    "Total de Descontos 1.299,35"
    "Liquido a Receber 7.200,65"
    "Base FGTS 8.500,00"
) -join "`n"

$sampleCsv | Out-File -FilePath $sampleCsvPath -Encoding utf8
Pass "Arquivo de entrada criado em $sampleCsvPath"

if (-not $Token) {
    if (-not $Email) {
        $Email = "smoke-clt-$runId@controlfinance.dev"
    }

    if (-not $LoginSecret) {
        $LoginSecret = 'SmokeClt-' + ($runId -replace '-', '')
    }

    $registerResponse = Invoke-Api -Method "POST" -Path "/auth/register" -BodyObject @{
        email    = $Email
        password = $LoginSecret
    } -WebSession $webSession

    if ($registerResponse.StatusCode -eq 201) {
        Pass "POST /auth/register -> 201"
    }
    else {
        Fail "POST /auth/register retornou $($registerResponse.StatusCode)"
        exit 1
    }

    $loginResponse = Invoke-Api -Method "POST" -Path "/auth/login" -BodyObject @{
        email    = $Email
        password = $LoginSecret
    } -WebSession $webSession

    $Token = [string]($loginResponse.Json.token)
    if (-not $Token) {
        $Token = [string]($loginResponse.Json.accessToken)
    }

    if ($loginResponse.StatusCode -eq 200 -and $Token) {
        Pass "POST /auth/login -> 200 com token"
    }
    elseif ($loginResponse.StatusCode -eq 200) {
        Pass "POST /auth/login -> 200 com sessao autenticada (cookie)"
    }
    else {
        Fail "POST /auth/login sem token valido"
        exit 1
    }
}
else {
    Pass "Token informado manualmente"
}

$authHeaders = @{}
if ($Token) {
    $authHeaders.Authorization = "Bearer $Token"
}

$bootstrapResponse = Invoke-Api -Method "GET" -Path "/tax" -Headers $authHeaders -WebSession $webSession
if ($bootstrapResponse.StatusCode -eq 200) {
    Pass "GET /tax -> 200"
    Save-JsonArtifact -Name "01-bootstrap.json" -Payload $bootstrapResponse.Json
}
else {
    Fail "GET /tax retornou $($bootstrapResponse.StatusCode)"
    exit 1
}

$uploadResponse = Invoke-Api -Method "POST" -Path "/tax/documents" -Headers $authHeaders -Form @{
    taxYear     = "$TaxYear"
    sourceLabel = "Smoke S10.6 $runId"
    sourceHint  = "Fundacao CLT"
    file        = Get-Item $sampleCsvPath
} -WebSession $webSession

$documentId = [int]($uploadResponse.Json.document.id)
if ($uploadResponse.StatusCode -eq 201 -and $documentId -gt 0) {
    Pass "POST /tax/documents -> 201 (documentId=$documentId)"
    Save-JsonArtifact -Name "02-upload-document.json" -Payload $uploadResponse.Json
}
else {
    Fail "POST /tax/documents nao retornou documentId valido"
    exit 1
}

$reprocessResponse = Invoke-Api -Method "POST" -Path "/tax/documents/$documentId/reprocess" -Headers $authHeaders -WebSession $webSession
if ($reprocessResponse.StatusCode -eq 200) {
    Pass "POST /tax/documents/$documentId/reprocess -> 200"
    Save-JsonArtifact -Name "03-reprocess-document.json" -Payload $reprocessResponse.Json
}
else {
    Fail "POST /tax/documents/$documentId/reprocess retornou $($reprocessResponse.StatusCode)"
    exit 1
}

$factsResponse = Invoke-Api -Method "GET" -Path "/tax/facts?taxYear=$TaxYear&reviewStatus=pending&pageSize=100" -Headers $authHeaders -WebSession $webSession
$factIds = @()
if ($factsResponse.Json -and $factsResponse.Json.items) {
    $factIds = @($factsResponse.Json.items | ForEach-Object { [int]$_.id } | Where-Object { $_ -gt 0 })
}

if ($factsResponse.StatusCode -eq 200 -and $factIds.Count -gt 0) {
    Pass "GET /tax/facts pendentes -> 200 ($($factIds.Count) fato(s))"
    Save-JsonArtifact -Name "04-facts-pending.json" -Payload $factsResponse.Json
}
else {
    Fail "GET /tax/facts nao retornou fatos pendentes para revisar"
    exit 1
}

$bulkReviewResponse = Invoke-Api -Method "POST" -Path "/tax/facts/bulk-review" -Headers $authHeaders -BodyObject @{
    factIds = $factIds
    action  = "approve"
    note    = "Aprovacao em lote via smoke S10.6 ($runId)."
} -WebSession $webSession

if ($bulkReviewResponse.StatusCode -eq 200) {
    Pass "POST /tax/facts/bulk-review -> 200"
    Save-JsonArtifact -Name "05-bulk-review.json" -Payload $bulkReviewResponse.Json
}
else {
    Fail "POST /tax/facts/bulk-review retornou $($bulkReviewResponse.StatusCode)"
    exit 1
}

$cltStatementResponse = Invoke-Api -Method "GET" -Path "/tax/income-statement-clt/$TaxYear" -Headers $authHeaders -WebSession $webSession
if ($cltStatementResponse.StatusCode -eq 200) {
    Pass "GET /tax/income-statement-clt/$TaxYear -> 200"
    Save-JsonArtifact -Name "06-income-statement-clt.json" -Payload $cltStatementResponse.Json
}
else {
    Fail "GET /tax/income-statement-clt/$TaxYear retornou $($cltStatementResponse.StatusCode)"
    exit 1
}

$checklist = [ordered]@{
    runId                  = $runId
    baseUrl                = $BaseUrl
    taxYear                = $TaxYear
    generatedAt            = (Get-Date).ToString("o")
    passed                 = $script:passed
    failed                 = $script:failed
    documentId             = $documentId
    cltStatementStatus     = [string]$cltStatementResponse.Json.status
    cltStatementMonths     = [int]$cltStatementResponse.Json.sourceCounts.months
    cltStatementFacts      = [int]$cltStatementResponse.Json.sourceCounts.approvedFacts
    cltAnnualGrossIncome   = [double]$cltStatementResponse.Json.totals.annualGrossIncome
    cltAnnualNetIncome     = [double]$cltStatementResponse.Json.totals.annualNetIncome
    cltAnnualIrrfWithheld  = [double]$cltStatementResponse.Json.totals.annualIrrfWithheld
}

$checklist | ConvertTo-Json -Depth 10 | Out-File -FilePath $checklistPath -Encoding utf8

Write-Host ""
Write-Host "=== Resultado Smoke S10.6 ===" -ForegroundColor Cyan
Write-Host "Passou : $($script:passed)"
Write-Host "Falhou : $($script:failed)"
Write-Host "Artefatos: $artifactDir"
Write-Host "Checklist: $checklistPath"
Write-Host ""

if ($script:failed -gt 0) {
    exit 1
}

exit 0
