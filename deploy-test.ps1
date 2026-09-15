<#
.SYNOPSIS
    Deploy this checkout to the TESTING environment (the dev copy), then check it.

.DESCRIPTION
    The testing environment is the dev copy of the helpdesk. It is on the same
    server as production but separate from it in everything that matters: its
    own directory, pm2 app and port, its own database (helpdesk_dev, a copy of
    production's data), and mail that only ever goes to MAIL_REDIRECT_TO.
    Address: https://dev-helpdesk.cristalino.co.il. This script cannot deploy
    production.

    In order:
      1. Says what will ship: the branch, the commit, and any uncommitted
         changes. The working tree is what deploys, so work can be tried on the
         testing environment before it is committed.
      2. Runs the tests (npx jest --ci). The server's build does not run them,
         so this is the only place they stop a broken deploy. -SkipTests skips.
      3. Deploys with .\deploy.ps1 -Target dev.
      4. Asks the testing environment which version it runs (GET /api/v1) and
         fails unless it is the one in this checkout's lib\version.ts.

    Until dev-helpdesk.cristalino.co.il has a DNS record, step 4 goes to the
    server's IP with the dev host name in the Host header. To open the site in
    a browser before then, add this line to
    C:\Windows\System32\drivers\etc\hosts (as administrator) and use http://
    (the certificate comes after DNS):
        18.195.248.157  dev-helpdesk.cristalino.co.il

    bash deploy-test.sh is the same script for Git Bash, Linux and macOS.

.EXAMPLE
    .\deploy-test.ps1
    Tests, deploy, check. The key is found as deploy.ps1 finds it: -Key, then
    $env:DEPLOY_KEY, then ..\CrisRouter\alon.pem.

.EXAMPLE
    .\deploy-test.ps1 -SkipTests

.EXAMPLE
    .\deploy-test.ps1 -CheckOnly
    Deploys nothing; reports which version the testing environment runs.
#>

# KEEP THIS FILE PURE ASCII, for the reason given at the top of deploy.ps1:
# Windows PowerShell 5.1 reads a .ps1 without a byte-order mark in the ANSI
# codepage, and a single non-ASCII character can break the parse.
# __tests__/deployTestScripts.test.ts fails the build if one returns.

#Requires -Version 5.1
[CmdletBinding()]
param(
    # The private key, handed on to deploy.ps1.
    [string] $Key,
    # Deploy without running the tests first.
    [switch] $SkipTests,
    # Deploy nothing: only report which version the testing environment runs.
    [switch] $CheckOnly
)

$ErrorActionPreference = 'Stop'
$Root   = $PSScriptRoot
$Domain = 'dev-helpdesk.cristalino.co.il'
$Server = if ($env:DEPLOY_HOST) { $env:DEPLOY_HOST } else { '18.195.248.157' }
$clock  = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Step([string] $Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Stop-With([string] $Text) { Write-Host $Text -ForegroundColor Red; exit 1 }

# A native command's output, or $null when it is missing or fails.
function Get-Output([string] $Exe, [string[]] $Arguments) {
    try {
        $out = & $Exe @Arguments 2>$null
        if ($LASTEXITCODE -eq 0) { return $out }
    } catch { }
    return $null
}

# Which version the testing environment runs, and how it was reached: the real
# address first, then the server's IP with the dev host name, for as long as
# DNS has no record for it. GET /api/v1 answers { "appVersion": ... } (v3.89).
function Get-TestingVersion {
    $routes = @(
        @{ Via = "https://$Domain"; Args = @("https://$Domain/api/v1") },
        @{ Via = "http://$Server with Host: $Domain (no DNS record yet)"; Args = @('-H', "Host: $Domain", "http://$Server/api/v1") }
    )
    foreach ($route in $routes) {
        $body = Get-Output 'curl.exe' (@('-s', '-m', '10', '-H', 'Accept: application/json') + $route.Args)
        if (-not $body) { continue }
        try { $index = ($body -join "`n") | ConvertFrom-Json } catch { continue }
        if ($index.appVersion) { return @{ Version = [string] $index.appVersion; Via = $route.Via } }
    }
    return $null
}

$versionFile = Join-Path $Root 'lib\version.ts'
if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) { Stop-With "Missing $versionFile - is this the repository root?" }
$match = [regex]::Match([System.IO.File]::ReadAllText($versionFile), 'export const VERSION = "([^"]*)"')
if (-not $match.Success) { Stop-With "Could not read VERSION from $versionFile." }
$Version = $match.Groups[1].Value

Write-Host "Testing environment: https://$Domain  (the dev copy - never production)" -ForegroundColor Cyan

if ($CheckOnly) {
    $running = Get-TestingVersion
    if (-not $running) { Stop-With 'The testing environment did not answer with a version.' }
    Write-Host "It runs version $($running.Version) - reached via $($running.Via)"
    if ($running.Version -ne $Version) { Write-Host "This checkout is version $Version." -ForegroundColor Yellow }
    exit 0
}

# -- 1. What will ship ---------------------------------------------------------
$branch  = Get-Output 'git' @('-C', $Root, 'rev-parse', '--abbrev-ref', 'HEAD')
$commit  = Get-Output 'git' @('-C', $Root, 'rev-parse', '--short', 'HEAD')
$changes = Get-Output 'git' @('-C', $Root, 'status', '--porcelain')
$dirty   = if ($changes) { @($changes).Count } else { 0 }
if ($branch) { Write-Host "Shipping: $branch @ $commit, version $Version" } else { Write-Host "Shipping: version $Version" }
if ($dirty -gt 0) { Write-Host "  including $dirty uncommitted change(s) - the working tree is what deploys" -ForegroundColor Yellow }

# -- 2. Tests: the server build does not run them ------------------------------
if ($SkipTests) {
    Write-Host '  -SkipTests: not running the tests' -ForegroundColor Yellow
} else {
    Write-Step 'Tests (npx jest --ci) - the server build does not run them'
    Push-Location -LiteralPath $Root
    try { & npx jest --ci } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Stop-With 'The tests failed - nothing was deployed.' }
}

# -- 3. Deploy -------------------------------------------------------------------
Write-Step 'Deploy (deploy.ps1 -Target dev)'
$deployArgs = @{ Target = 'dev' }
if ($Key) { $deployArgs.Key = $Key }
$global:LASTEXITCODE = 0
& (Join-Path $Root 'deploy.ps1') @deployArgs
if ($LASTEXITCODE -ne 0) { Stop-With "The deploy failed (exit $LASTEXITCODE)." }

# -- 4. Check --------------------------------------------------------------------
# ${Version}, with braces: PowerShell reads a '?' straight after a name as part of it.
Write-Step "Check: does the testing environment run ${Version}?"
$running = $null
foreach ($attempt in 1..6) {
    $running = Get-TestingVersion
    if ($running -and $running.Version -eq $Version) { break }
    if ($attempt -lt 6) { Start-Sleep -Seconds 5 }
}
if (-not $running) { Stop-With 'Deployed, but the testing environment did not answer with a version.' }
if ($running.Version -ne $Version) { Stop-With "Deployed, but the testing environment runs $($running.Version), not $Version." }

$took = '{0:m\:ss}' -f $clock.Elapsed
Write-Host "The testing environment runs version $Version - reached via $($running.Via). Took $took." -ForegroundColor Green
if ($running.Via -notlike 'https://*') {
    Write-Host "No DNS record for $Domain yet. To open it in a browser, add '$Server  $Domain' to"
    Write-Host 'C:\Windows\System32\drivers\etc\hosts (as administrator) and use http://.'
}
