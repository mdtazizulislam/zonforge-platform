param(
  [string[]]$Ports = @("3000","3001","3002","3003","3005","3006","3007","3008","3015","3020","3021","3022"),
  [string]$DashboardUrl = "http://localhost:5173"
)

$ErrorActionPreference = "Stop"
$failed = @()

Write-Host "=== ZonForge Required Health Check ==="
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

foreach ($port in $Ports) {
  try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$port/health" -Method Get -TimeoutSec 5
    Write-Host ("PASS :{0}  svc={1}  status={2}" -f $port, $resp.service, $resp.status)
  } catch {
    Write-Host ("FAIL :{0}  {1}" -f $port, $_.Exception.Message)
    $failed += $port
  }
}

Write-Host "=== Dashboard ==="
try {
  $dash = Invoke-WebRequest -Uri $DashboardUrl -TimeoutSec 5
  Write-Host ("PASS :5173  HTTP {0}" -f $dash.StatusCode)
} catch {
  Write-Host ("FAIL :5173  {0}" -f $_.Exception.Message)
  $failed += "5173"
}

if ($failed.Count -gt 0) {
  Write-Error ("Health check failed for: {0}" -f ($failed -join ", "))
  exit 1
}

Write-Host "All required endpoints are healthy."
