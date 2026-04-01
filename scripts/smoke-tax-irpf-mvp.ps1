<#
.SYNOPSIS
  Smoke test ponta a ponta da Central do Leao (IRPF MVP).

.DESCRIPTION
  Executa o fluxo fiscal operacional de S9.5:
    1) bootstrap fiscal
    2) upload documental
    3) reprocessamento
    4) revisao em lote
    5) resumo + obrigatoriedade
    6) rebuild de snapshot
    7) export oficial JSON e CSV

  Tambem salva evidencias em pasta local dentro de tmp/.

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

.EXAMPLE
  .\scripts\smoke-tax-irpf-mvp.ps1 -BaseUrl "https://control-finance-react-tailwind.onrender.com" -TaxYear 2026

.EXAMPLE
  .\scripts\smoke-tax-irpf-mvp.ps1 -BaseUrl "http://localhost:3000" -TaxYear 2026 -Token "<jwt>"
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
$artifactDir = Join-Path $OutputDir "smoke-irpf-mvp-$runId"
$sampleCsvPath = Join-Path $artifactDir "documento-irpf-smoke.csv"
$checklistPath = Join-Path $artifactDir "checklist-s9-5.json"

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
            $jsonBody = $BodyObject | ConvertTo-Json -Depth 20
            $invokeArgs.ContentType = "application/json"
            $invokeArgs.Body = $jsonBody
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
Write-Host "=== Smoke S9.5 - IRPF MVP ===" -ForegroundColor Cyan
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
    Write-Host "  7) GET /tax/summary/:taxYear e GET /tax/obligation/:taxYear"
    Write-Host "  8) POST /tax/summary/:taxYear/rebuild"
    Write-Host "  9) GET /tax/export/:taxYear?format=json e csv"
    exit 0
}

if (-not (Get-Command Invoke-WebRequest).Parameters.ContainsKey("Form")) {
    throw "Este script precisa de PowerShell com suporte a -Form em Invoke-WebRequest (recomendado: PowerShell 7+)."
}

New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$webSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$sampleCsv = @(
    "Comprovante de Rendimentos Pagos e de Imposto sobre a Renda Retido na Fonte"
    "Fonte pagadora ACME LTDA"
    "CNPJ 12.345.678/0001-90"
    "Rendimentos tributaveis R$ 54.321,00"
    "Imposto sobre a renda retido na fonte R$ 4.321,09"
    "Decimo terceiro R$ 5.000,00"
) -join "`n"

$sampleCsv | Out-File -FilePath $sampleCsvPath -Encoding utf8
Pass "Arquivo de entrada criado em $sampleCsvPath"

if (-not $Token) {
    if (-not $Email) {
        $Email = "smoke-tax-$runId@controlfinance.dev"
    }

    if (-not $LoginSecret) {
        $LoginSecret = 'SmokeTax-' + ($runId -replace '-', '')
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
    sourceLabel = "Smoke S9.5 $runId"
    sourceHint  = "Fluxo ponta a ponta IRPF MVP"
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
    note    = "Aprovacao em lote via smoke S9.5 ($runId)."
} -WebSession $webSession

if ($bulkReviewResponse.StatusCode -eq 200) {
    Pass "POST /tax/facts/bulk-review -> 200"
    Save-JsonArtifact -Name "05-bulk-review.json" -Payload $bulkReviewResponse.Json
}
else {
    Fail "POST /tax/facts/bulk-review retornou $($bulkReviewResponse.StatusCode)"
    exit 1
}

$summaryBeforeRebuild = Invoke-Api -Method "GET" -Path "/tax/summary/$TaxYear" -Headers $authHeaders -WebSession $webSession
$obligationResponse = Invoke-Api -Method "GET" -Path "/tax/obligation/$TaxYear" -Headers $authHeaders -WebSession $webSession

if ($summaryBeforeRebuild.StatusCode -eq 200) {
    Pass "GET /tax/summary/$TaxYear -> 200"
    Save-JsonArtifact -Name "06-summary-before-rebuild.json" -Payload $summaryBeforeRebuild.Json
}
else {
    Fail "GET /tax/summary/$TaxYear retornou $($summaryBeforeRebuild.StatusCode)"
    exit 1
}

if ($obligationResponse.StatusCode -eq 200) {
    Pass "GET /tax/obligation/$TaxYear -> 200"
    Save-JsonArtifact -Name "07-obligation.json" -Payload $obligationResponse.Json
}
else {
    Fail "GET /tax/obligation/$TaxYear retornou $($obligationResponse.StatusCode)"
    exit 1
}

$rebuildResponse = Invoke-Api -Method "POST" -Path "/tax/summary/$TaxYear/rebuild" -Headers $authHeaders -WebSession $webSession
if ($rebuildResponse.StatusCode -eq 200) {
    Pass "POST /tax/summary/$TaxYear/rebuild -> 200"
    Save-JsonArtifact -Name "08-summary-rebuild.json" -Payload $rebuildResponse.Json
}
else {
    Fail "POST /tax/summary/$TaxYear/rebuild retornou $($rebuildResponse.StatusCode)"
    exit 1
}

$exportJsonResponse = Invoke-Api -Method "GET" -Path "/tax/export/${TaxYear}?format=json" -Headers $authHeaders -WebSession $webSession
$exportJsonPath = Join-Path $artifactDir "09-export-dossie.json"
$exportJsonResponse.Raw | Out-File -FilePath $exportJsonPath -Encoding utf8

$exportJsonPayload = $null
try {
    $exportJsonPayload = $exportJsonResponse.Raw | ConvertFrom-Json
}
catch {
    $exportJsonPayload = $null
}

if ($exportJsonResponse.StatusCode -eq 200 -and $exportJsonPayload -and $exportJsonPayload.manifest) {
    Pass "GET /tax/export/${TaxYear}?format=json -> 200"
}
else {
    Fail "GET /tax/export/${TaxYear}?format=json sem payload valido"
    exit 1
}

$exportCsvResponse = Invoke-Api -Method "GET" -Path "/tax/export/${TaxYear}?format=csv" -Headers $authHeaders -WebSession $webSession
$exportCsvPath = Join-Path $artifactDir "10-export-dossie.csv"
$exportCsvResponse.Raw | Out-File -FilePath $exportCsvPath -Encoding utf8

if ($exportCsvResponse.StatusCode -eq 200 -and $exportCsvResponse.Raw -match "factId,factType,category") {
    Pass "GET /tax/export/${TaxYear}?format=csv -> 200"
}
else {
    Fail "GET /tax/export/${TaxYear}?format=csv sem cabecalho esperado"
    exit 1
}

$checklist = [ordered]@{
    runId     = $runId
    baseUrl   = $BaseUrl
    taxYear   = $TaxYear
    timestamp = (Get-Date).ToString("o")
    criteria  = [ordered]@{
        ingestao   = ($documentId -gt 0)
        revisao    = ($factIds.Count -gt 0)
        resumo     = ($rebuildResponse.StatusCode -eq 200)
        exportJson = ($exportJsonResponse.StatusCode -eq 200)
        exportCsv  = ($exportCsvResponse.StatusCode -eq 200)
    }
    artifacts = [ordered]@{
        bootstrap            = "01-bootstrap.json"
        upload               = "02-upload-document.json"
        reprocess            = "03-reprocess-document.json"
        factsPending         = "04-facts-pending.json"
        bulkReview           = "05-bulk-review.json"
        summaryBeforeRebuild = "06-summary-before-rebuild.json"
        obligation           = "07-obligation.json"
        summaryRebuild       = "08-summary-rebuild.json"
        exportJson           = "09-export-dossie.json"
        exportCsv            = "10-export-dossie.csv"
    }
}

($checklist | ConvertTo-Json -Depth 20) | Out-File -FilePath $checklistPath -Encoding utf8
Pass "Checklist de evidencias salvo em $checklistPath"

Write-Host ""
Write-Host "=== Resultado Smoke S9.5 ===" -ForegroundColor Cyan
Write-Host "PASS: $($script:passed)"
Write-Host "FAIL: $($script:failed)"
Write-Host "Evidencias: $artifactDir"
Write-Host ""

if ($script:failed -gt 0) {
    exit 1
}
