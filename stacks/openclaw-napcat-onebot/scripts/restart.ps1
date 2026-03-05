$ErrorActionPreference = "Stop"

$stackRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $stackRoot ".env"
$envExample = Join-Path $stackRoot ".env.example"

if (!(Test-Path $envFile)) {
  Copy-Item -Force $envExample $envFile
  Write-Host "Created .env from .env.example. Review it and set NAPCAT_ACCOUNT / API keys as needed."
}

$envText = Get-Content -Raw $envFile
$updated = $false
if ($envText -match "(?m)^OPENCLAW_GATEWAY_TOKEN=change-me\s*$") {
  $token = [guid]::NewGuid().ToString("N")
  $envText = $envText -replace "(?m)^OPENCLAW_GATEWAY_TOKEN=change-me\s*$", "OPENCLAW_GATEWAY_TOKEN=$token"
  $updated = $true
}
if ($envText -match "(?m)^CLAWDBOT_GATEWAY_TOKEN=change-me\s*$") {
  $token = [guid]::NewGuid().ToString("N")
  $envText = $envText -replace "(?m)^CLAWDBOT_GATEWAY_TOKEN=change-me\s*$", "CLAWDBOT_GATEWAY_TOKEN=$token"
  $updated = $true
}
if ($updated) {
  [System.IO.File]::WriteAllText($envFile, $envText, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Updated placeholder tokens in .env."
}

$composeFile = Join-Path $stackRoot "docker-compose.yml"
$composeArgs = @(
  "--project-directory",
  $stackRoot.Path,
  "--env-file",
  (Resolve-Path $envFile).Path,
  "-f",
  (Resolve-Path $composeFile).Path
)

docker compose @composeArgs up -d --force-recreate openclaw-gateway napcat
& (Join-Path $PSScriptRoot "bootstrap.ps1")
docker compose @composeArgs ps

