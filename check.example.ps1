# check.example.ps1
# Copy this file to check.ps1 and fill in your actual credentials.
# check.ps1 is gitignored to keep secrets out of source control.

$pw = ConvertTo-SecureString 'YOUR_ADMINISTRATOR_PASSWORD' -AsPlainText -Force
$cred = New-Object PSCredential('Administrator', $pw)
Invoke-Command -ComputerName YOUR_SERVER_IP -Credential $cred -ScriptBlock {
    try { Invoke-WebRequest "http://localhost:3000" -UseBasicParsing -TimeoutSec 5 | Out-Null } catch {}
    Start-Sleep -Seconds 2

    Write-Host "=== App log (stdout) ==="
    if (Test-Path "C:\helpdesk\app.log") {
        Get-Content "C:\helpdesk\app.log" -Tail 50
    }

    Write-Host "=== DB connectivity test ==="
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $tcpClient.Connect("YOUR_RDS_HOSTNAME", 5432)
        Write-Host "PostgreSQL: REACHABLE"
    } catch {
        Write-Host "PostgreSQL: CANNOT CONNECT - $_"
    } finally {
        $tcpClient.Close()
    }
}
