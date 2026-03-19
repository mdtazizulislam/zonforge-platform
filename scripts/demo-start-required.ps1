param(
  [switch]$NoBuild,
  [switch]$BuildOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== ZonForge Required Local Platform Starter ==="
Write-Host "Repo: $(Get-Location)"

if (-not $NoBuild) {
  Write-Host "Running required build..."
  npm run build:required
  if ($LASTEXITCODE -ne 0) {
    throw "build:required failed"
  }
}

if ($BuildOnly) {
  Write-Host "Build-only mode complete."
  exit 0
}

Write-Host "Starting required services (long-running)..."
npm run dev:required
exit $LASTEXITCODE
