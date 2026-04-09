# deploy.example.ps1
# Copy this file to deploy.ps1 and fill in your actual credentials.
# deploy.ps1 is gitignored to keep secrets out of source control.

$server = 'YOUR_SERVER_IP'
$pw = ConvertTo-SecureString 'YOUR_ADMINISTRATOR_PASSWORD' -AsPlainText -Force
$cred = New-Object PSCredential('Administrator', $pw)
$session = New-PSSession -ComputerName $server -Credential $cred
$local = "C:\path\to\local\helpdesk"
$ProgressPreference = 'SilentlyContinue'

# Read version from lib/version.ts
$versionLine = Get-Content "$local\lib\version.ts" | Select-String 'APP_VERSION\s*=\s*"(.*)"'
$version = $versionLine.Matches[0].Groups[1].Value
Write-Host "Deploying version $version..." -ForegroundColor Cyan

Write-Host "Zipping source files..."
$zip = "C:\Windows\Temp\helpdesk-src.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path `
    "$local\app", `
    "$local\components", `
    "$local\lib", `
    "$local\prisma", `
    "$local\public", `
    "$local\types", `
    "$local\__tests__", `
    "$local\jest.config.ts", `
    "$local\jest.setup.ts", `
    "$local\auth.ts", `
    "$local\package.json", `
    "$local\package-lock.json", `
    "$local\tsconfig.json", `
    "$local\.env", `
    "$local\.env.local", `
    "$local\ecosystem.config.js", `
    "$local\next.config.ts" `
    -DestinationPath $zip
$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Zip: $sizeMB MB — uploading..."

Copy-Item -Path $zip -Destination "C:\Windows\Temp\helpdesk-src.zip" -Force -ToSession $session

Write-Host "Extracting and building on server..."
Invoke-Command -Session $session -ScriptBlock {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";C:\Users\Administrator\AppData\Roaming\npm"

    # Stop app
    Stop-ScheduledTask -TaskName "Helpdesk" -ErrorAction SilentlyContinue
    Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2

    # Extract source
    Remove-Item "C:\helpdesk\app" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "C:\helpdesk\components" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "C:\helpdesk\lib" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "C:\helpdesk\types" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "C:\helpdesk\__tests__" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "C:\helpdesk\.next" -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path "C:\Windows\Temp\helpdesk-src.zip" -DestinationPath "C:\helpdesk" -Force
    Remove-Item "C:\Windows\Temp\helpdesk-src.zip" -Force

    Set-Location "C:\helpdesk"

    Write-Host "Installing dependencies..."
    npm install 2>&1 | Select-String -Pattern "added|error" | Select-Object -Last 5

    Write-Host "Running database migrations..."
    npx prisma migrate deploy 2>&1 | Select-String -Pattern "Migration|error|Applied"

    Write-Host "Generating Prisma client..."
    npx prisma generate 2>&1 | Select-String -Pattern "Generated|error"

    Write-Host "Building Next.js..."
    npm run build 2>&1

    Write-Host "Starting app..."
    Start-ScheduledTask -TaskName "Helpdesk"
    Start-Sleep -Seconds 5

    Write-Host "=== Port 3000 ==="
    netstat -ano | findstr ':3000'
}

Remove-PSSession $session
$ProgressPreference = 'Continue'
Write-Host "Done! Version $version live at http://$server`:3000" -ForegroundColor Green
