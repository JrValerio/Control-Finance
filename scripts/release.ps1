<#
.SYNOPSIS
  Automates the release process for Control Finance.

.DESCRIPTION
  Given a version string, this script:
    1. Verifies CHANGELOG.md has the target version section
    2. Bumps package.json versions (root, api, web)
    3. Creates chore/release-vX.Y.Z branch, commits, pushes
    4. Opens a PR via GitHub API and squash-merges it
    5. Tags the squash merge SHA and pushes the tag
    6. Creates a GitHub Release with the CHANGELOG section body
    7. Deletes the release branch (remote + local)

  Compatible with PowerShell 5.1+.

.PARAMETER Version
  Target version, e.g. "1.27.0"

.PARAMETER Repo
  GitHub "owner/repo" slug. Default: "JrValerio/Control-Finance-React-TailWind"

.PARAMETER DryRun
  Print what would happen without making any changes.

.EXAMPLE
  .\scripts\release.ps1 -Version "1.27.0"
  .\scripts\release.ps1 -Version "1.27.0" -DryRun
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [string]$Repo = "JrValerio/Control-Finance-React-TailWind",

  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Log([string]$msg, [string]$color = "Cyan") {
  Write-Host ("[{0}] {1}" -f [datetime]::Now.ToString("HH:mm:ss"), $msg) -ForegroundColor $color
}

function Die([string]$msg) {
  Write-Host "[FAIL] $msg" -ForegroundColor Red
  exit 1
}

function NullOr($value, $fallback) {
  if ($null -eq $value) { return $fallback }
  return $value
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [hashtable]$Body = @{}
  )
  $uri = "https://api.github.com/repos/$Repo/$Path"
  $headers = @{
    "Authorization" = "Bearer $script:GhToken"
    "Accept"        = "application/vnd.github+json"
    "Content-Type"  = "application/json"
    "User-Agent"    = "control-finance-release-script"
  }
  $bodyJson = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Depth 10 -Compress } else { $null }

  try {
    if ($bodyJson) {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $bodyJson
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }
    return $resp
  } catch {
    $statusCode = ""
    $errMsg = "$_"
    try {
      $statusCode = [string]$_.Exception.Response.StatusCode
      $detail = $_.ErrorDetails.Message | ConvertFrom-Json
      $errMsg = NullOr $detail.message "$_"
    } catch { }
    Die ("API {0} {1} failed ({2}): {3}" -f $Method, $Path, $statusCode, $errMsg)
  }
}

# ---------------------------------------------------------------------------
# Validate version format
# ---------------------------------------------------------------------------

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  Die "Version must be semver (e.g. 1.27.0), got: $Version"
}

$branch = "chore/release-v$Version"
$root   = Split-Path $PSScriptRoot -Parent

Log "Release script starting -- v$Version" "Yellow"
if ($DryRun) { Log "DRY RUN -- no changes will be made" "Magenta" }

# ---------------------------------------------------------------------------
# Resolve GitHub token from credential manager
# ---------------------------------------------------------------------------

Log "Resolving GitHub token..."
$credInput = "protocol=https`nhost=github.com"
$credLines = $credInput | & git credential fill 2>$null
$tokenLine = $credLines | Where-Object { $_ -match '^password=(.+)$' } | Select-Object -First 1
if (-not $tokenLine) { Die "Could not resolve GitHub token. Ensure 'git credential fill' works." }
$script:GhToken = $tokenLine -replace '^password=', ''
Log ("Token resolved ({0} chars)" -f $script:GhToken.Length)

# ---------------------------------------------------------------------------
# Verify on main and working tree is clean
# ---------------------------------------------------------------------------

Push-Location $root
try {
  $currentBranch = & git rev-parse --abbrev-ref HEAD
  if ($currentBranch -ne "main") { Die "Must run from main branch (currently on '$currentBranch')" }

  $dirtyFiles = & git status --porcelain
  if ($dirtyFiles) { Die "Working tree not clean. Commit or stash changes first." }

  & git fetch origin 2>&1 | Out-Null
  $behind = [int](& git rev-list HEAD..origin/main --count)
  if ($behind -gt 0) { Die "Local main is $behind commits behind origin/main. Run: git pull" }
} finally {
  Pop-Location
}

Log "Working tree clean, main is up to date"

# ---------------------------------------------------------------------------
# Verify CHANGELOG has the target section
# ---------------------------------------------------------------------------

$changelogPath = Join-Path $root "CHANGELOG.md"
$changelog = Get-Content $changelogPath -Raw -Encoding UTF8

$escapedVer = [regex]::Escape($Version)
if ($changelog -notmatch "## \[$escapedVer\]") {
  Log "CHANGELOG.md is missing the [[$Version]] section." "Yellow"
  Log ("Expected header: ## [{0}] - {1}" -f $Version, [datetime]::Now.ToString("yyyy-MM-dd")) "Yellow"
  Die "Aborting: add the CHANGELOG section before running the release."
}

Log "CHANGELOG section for v$Version confirmed"

# ---------------------------------------------------------------------------
# Extract release notes from CHANGELOG
# ---------------------------------------------------------------------------

$pattern = "(?s)## \[$escapedVer\][^\n]*\n(.*?)(?=\n## \[|\z)"
$m = [regex]::Match($changelog, $pattern)
$releaseNotes = if ($m.Success) { $m.Groups[1].Value.Trim() } else { "" }
Log ("Extracted {0} chars of release notes" -f $releaseNotes.Length)

# ---------------------------------------------------------------------------
# Dry-run exit
# ---------------------------------------------------------------------------

if ($DryRun) {
  Log "DRY RUN: would create branch '$branch', open PR, squash merge, tag v$Version, publish release" "Magenta"
  $preview = $releaseNotes.Substring(0, [Math]::Min(400, $releaseNotes.Length))
  Log "Release notes preview:`n$preview" "Gray"
  exit 0
}

# ---------------------------------------------------------------------------
# Bump package.json versions
# ---------------------------------------------------------------------------

Log "Bumping package versions to $Version..."
$pkgPaths = @(
  (Join-Path $root "package.json"),
  (Join-Path $root "apps\api\package.json"),
  (Join-Path $root "apps\web\package.json")
)
foreach ($f in $pkgPaths) {
  $raw = Get-Content $f -Raw -Encoding UTF8 | ConvertFrom-Json
  $old = $raw.version
  $raw.version = $Version
  $raw | ConvertTo-Json -Depth 20 | Set-Content $f -Encoding UTF8
  $rel = [System.IO.Path]::GetRelativePath($root, $f)
  Log ("  {0}: {1} -> {2}" -f $rel, $old, $Version)
}

# ---------------------------------------------------------------------------
# Commit on release branch
# ---------------------------------------------------------------------------

Push-Location $root
try {
  & git checkout -b $branch 2>&1 | Out-Null
  & git add package.json apps/api/package.json apps/web/package.json CHANGELOG.md | Out-Null
  & git commit -m "chore(release): v$Version" | Out-Null
  Log "Committed on branch $branch"

  & git push origin $branch 2>&1 | Out-Null
  Log "Branch pushed to origin"
} finally {
  Pop-Location
}

# ---------------------------------------------------------------------------
# Create PR
# ---------------------------------------------------------------------------

Log "Creating PR..."
$pr = Invoke-Api -Method POST -Path "pulls" -Body @{
  title = "chore(release): v$Version"
  head  = $branch
  base  = "main"
  body  = "Bump versions + CHANGELOG for v$Version."
}
Log ("PR #{0} created: {1}" -f $pr.number, $pr.html_url)

# ---------------------------------------------------------------------------
# Squash merge
# ---------------------------------------------------------------------------

Log ("Merging PR #{0} (squash)..." -f $pr.number)
$merge = Invoke-Api -Method PUT -Path ("pulls/{0}/merge" -f $pr.number) -Body @{
  merge_method   = "squash"
  commit_title   = ("chore(release): v{0} (#{1})" -f $Version, $pr.number)
  commit_message = "Bump package versions + CHANGELOG for v$Version."
}
if (-not $merge.merged) { Die "Merge did not succeed: $($merge.message)" }
$mergeSha = $merge.sha
Log "Merged at $mergeSha"

# ---------------------------------------------------------------------------
# Sync local main and tag
# ---------------------------------------------------------------------------

Push-Location $root
try {
  & git fetch origin 2>&1 | Out-Null
  & git checkout main 2>&1 | Out-Null
  & git reset --hard origin/main 2>&1 | Out-Null

  # Remove pre-existing local tag if any
  & git tag -d "v$Version" 2>$null | Out-Null

  & git tag -a "v$Version" $mergeSha -m "v$Version" | Out-Null
  & git push origin "v$Version" 2>&1 | Out-Null
  Log "Tag v$Version pushed"
} finally {
  Pop-Location
}

# ---------------------------------------------------------------------------
# Create GitHub Release
# ---------------------------------------------------------------------------

Log "Creating GitHub Release..."
$release = Invoke-Api -Method POST -Path "releases" -Body @{
  tag_name   = "v$Version"
  name       = "v$Version"
  body       = $releaseNotes
  draft      = $false
  prerelease = $false
}
Log ("Release published: {0}" -f $release.html_url)

# ---------------------------------------------------------------------------
# Delete release branch
# ---------------------------------------------------------------------------

Log "Cleaning up release branch..."
try {
  Invoke-Api -Method DELETE -Path ("git/refs/heads/{0}" -f $branch) | Out-Null
} catch {
  Log "Remote branch delete failed (may already be gone): $_" "Yellow"
}
Push-Location $root
try {
  & git branch -D $branch 2>$null | Out-Null
} finally {
  Pop-Location
}
Log "Branch $branch deleted"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Release v$Version complete!" -ForegroundColor Green
Write-Host ("  {0}" -f $release.html_url) -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
