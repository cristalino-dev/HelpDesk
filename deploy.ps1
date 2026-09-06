<#
.SYNOPSIS
    Deploy HelpDesk to the Lightsail server, from PowerShell.

.DESCRIPTION
    The PowerShell twin of deploy.sh, for Windows without Git Bash or WSL. It
    does exactly what deploy.sh does and shares its two moving parts —
    scripts/maintenance.template.html and scripts/deploy-remote.sh — so the two
    entry points cannot drift apart. Only the plumbing differs.

    Everything it needs ships with Windows 10/11: ssh.exe and scp.exe (OpenSSH
    client) and tar.exe (bsdtar). No Git Bash, no WSL, no extra install.

    Three Windows-specific details it handles for you:

      * OpenSSH refuses a key whose ACL is too permissive — the Windows
        equivalent of "UNPROTECTED PRIVATE KEY FILE". Rather than change the
        permissions on your key, it works from a locked-down temporary COPY and
        deletes it afterwards. Your alon.pem is never modified.
      * The remote script is piped to bash on Linux, so its CRLFs are converted
        to LF first. (.gitattributes should keep them LF already; this is the
        belt to that braces.)
      * Temporary files are written as UTF-8 WITHOUT a BOM. PowerShell 5's
        Out-File -Encoding UTF8 adds one, which would corrupt the Hebrew
        maintenance page and break the shell script.

.EXAMPLE
    .\deploy.ps1
    Uses ..\CrisRouter\alon.pem, the path deploy.sh has always defaulted to.

.EXAMPLE
    .\deploy.ps1 -Key C:\Users\AlonKerem\Development\alon.pem

.EXAMPLE
    $env:DEPLOY_KEY = "C:\Users\AlonKerem\Development\alon.pem"; .\deploy.ps1
#>

#Requires -Version 5.1
[CmdletBinding()]
param(
    # The private key. Falls back to $env:DEPLOY_KEY, then to deploy.sh's default.
    [string] $Key,
    [string] $Server,
    [string] $User,
    [string] $RemoteDir
)

$ErrorActionPreference = 'Stop'

# ── Defaults, matching deploy.sh exactly ────────────────────────────────────
if (-not $Key)       { $Key       = $env:DEPLOY_KEY }
if (-not $Server)    { $Server    = if ($env:DEPLOY_HOST)       { $env:DEPLOY_HOST }       else { '18.195.248.157' } }
if (-not $User)      { $User      = if ($env:DEPLOY_USER)       { $env:DEPLOY_USER }       else { 'ubuntu' } }
if (-not $RemoteDir) { $RemoteDir = if ($env:DEPLOY_REMOTE_DIR) { $env:DEPLOY_REMOTE_DIR } else { '/home/ubuntu/helpdesk' } }

$Local = $PSScriptRoot
if (-not $Key) { $Key = Join-Path $Local '..\CrisRouter\alon.pem' }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Assert-ExitCode([string] $What) {
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)." }
}

# ── Preflight ───────────────────────────────────────────────────────────────
foreach ($exe in 'ssh', 'scp', 'tar') {
    if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
        throw "'$exe' not found. It ships with Windows 10/11 — enable it under Settings > System > Optional features > OpenSSH Client."
    }
}

if (-not (Test-Path -LiteralPath $Key -PathType Leaf)) {
    Write-Host "Deploy key not found: $Key" -ForegroundColor Red
    Write-Host "Pass it explicitly, e.g.  .\deploy.ps1 -Key C:\Users\you\alon.pem"
    exit 1
}
$Key = (Resolve-Path -LiteralPath $Key).Path

$templatePath = Join-Path $Local 'scripts\maintenance.template.html'
$remotePath   = Join-Path $Local 'scripts\deploy-remote.sh'
foreach ($p in $templatePath, $remotePath) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "Missing $p — is this the repository root?" }
}

# ── Version ─────────────────────────────────────────────────────────────────
$versionFile = Join-Path $Local 'lib\version.ts'
$match = [regex]::Match([System.IO.File]::ReadAllText($versionFile), 'export const VERSION = "([^"]*)"')
if (-not $match.Success) { throw "Could not read VERSION from $versionFile." }
$Version = $match.Groups[1].Value
Write-Host "Deploying version $Version..." -ForegroundColor Cyan

$tmpKey  = Join-Path $env:TEMP ("helpdesk-key-"   + [guid]::NewGuid().ToString('N'))
$tmpMain = Join-Path $env:TEMP ("helpdesk-maint-" + [guid]::NewGuid().ToString('N') + '.html')
$tmpRem  = Join-Path $env:TEMP ("helpdesk-rem-"   + [guid]::NewGuid().ToString('N') + '.sh')
$tmpTar  = Join-Path $env:TEMP ("helpdesk-src-"   + [guid]::NewGuid().ToString('N') + '.tar.gz')

try {
    # ── Locked-down copy of the key ─────────────────────────────────────────
    # ssh rejects a key others can read. We never touch the original.
    Copy-Item -LiteralPath $Key -Destination $tmpKey -Force
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $tmpKey /inheritance:r /grant:r "${me}:(R)" | Out-Null
    Assert-ExitCode 'icacls'

    # ── Maintenance page (version baked in) ─────────────────────────────────
    Write-Host "Generating maintenance page (v$Version)..."
    $html = [System.IO.File]::ReadAllText($templatePath).Replace('{{VERSION}}', $Version)
    [System.IO.File]::WriteAllText($tmpMain, $html, $utf8NoBom)

    # ── Archive ─────────────────────────────────────────────────────────────
    Write-Host "Archiving source files..."
    $items = @(
        'app', 'components', 'lib', 'prisma', 'public', 'scripts', 'types', 'auth.ts',
        'package.json', 'package-lock.json', 'tsconfig.json'
    )
    # .env / .env.local are gitignored; ship them only if this checkout has them,
    # exactly as deploy.sh does. Absent, the server keeps its existing copies.
    foreach ($envFile in '.env', '.env.local') {
        if (Test-Path -LiteralPath (Join-Path $Local $envFile) -PathType Leaf) { $items += $envFile }
    }
    if ($items -notcontains '.env' -and $items -notcontains '.env.local') {
        Write-Host "  no local .env/.env.local - the server keeps its existing ones"
    }
    $items += @('ecosystem.config.js', 'next.config.ts', 'maintenance-server.js')

    # Splatted, not passed as one array expression: @args is the unambiguous way
    # to hand a native command a variable-length argument list.
    $tarArgs = @('-czf', $tmpTar, '-C', $Local) + $items
    & tar @tarArgs
    Assert-ExitCode 'tar'

    $sizeMb = [math]::Round((Get-Item -LiteralPath $tmpTar).Length / 1MB, 1)
    Write-Host "Archive: ${sizeMb}M - uploading..."

    # ── Upload ──────────────────────────────────────────────────────────────
    # ${Server}: — the braces stop PowerShell reading "$Server:" as a drive.
    & scp -i $tmpKey -o StrictHostKeyChecking=no $tmpTar  "$User@${Server}:/tmp/helpdesk-src.tar.gz"
    Assert-ExitCode 'scp (archive)'
    & scp -i $tmpKey -o StrictHostKeyChecking=no $tmpMain "$User@${Server}:$RemoteDir/maintenance.html"
    Assert-ExitCode 'scp (maintenance page)'

    # ── Build on the server, then swap ──────────────────────────────────────
    Write-Host "Building on server (app keeps running)..." -ForegroundColor Cyan
    # LF only: bash on the far end chokes on CRLF with "$'\r': command not found".
    $remoteScript = [System.IO.File]::ReadAllText($remotePath).Replace("`r`n", "`n")
    [System.IO.File]::WriteAllText($tmpRem, $remoteScript, $utf8NoBom)

    # cmd does the stdin redirect: PowerShell 5 has no "<" operator, and piping
    # a string into a native command would re-encode it via the console codepage
    # and mangle the UTF-8 in this script's comments.
    & cmd.exe /c "ssh -i `"$tmpKey`" -o StrictHostKeyChecking=no $User@$Server bash < `"$tmpRem`""
    Assert-ExitCode 'ssh (remote build)'

    Write-Host ""
    Write-Host "Done! http://${Server}:3000" -ForegroundColor Green
}
finally {
    foreach ($f in $tmpKey, $tmpMain, $tmpRem, $tmpTar) {
        if ($f -and (Test-Path -LiteralPath $f)) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue }
    }
}
