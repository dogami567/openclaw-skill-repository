$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Key=" } | Select-Object -First 1
  if (!$line) {
    return ""
  }
  return ($line -replace "^\s*$Key=", "").Trim()
}

function Resolve-StackPath {
  param(
    [Parameter(Mandatory = $true)][string]$StackRoot,
    [Parameter(Mandatory = $true)][string]$PathValue
  )
  $raw = $PathValue.Trim()
  if (!$raw) {
    return $StackRoot
  }
  $normalized = $raw.Replace("/", "\")
  if ([System.IO.Path]::IsPathRooted($normalized)) {
    return $normalized
  }
  return (Join-Path $StackRoot $normalized)
}

function Wait-ContainerRunning {
  param(
    [Parameter(Mandatory = $true)][string]$ContainerId,
    [int]$TimeoutSec = 60
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $running = (docker inspect -f "{{.State.Running}}" $ContainerId 2>$null).Trim()
    if ($running -eq "true") {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Container did not become running: $ContainerId"
}

$stackRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $stackRoot ".env"
$envExample = Join-Path $stackRoot ".env.example"
if (!(Test-Path $envFile)) {
  Copy-Item -Force $envExample $envFile
  Write-Host "Created .env from .env.example. Review it and set NAPCAT_ACCOUNT / API keys as needed."
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

$onebotToken = Get-EnvValue -Path $envFile -Key "ONEBOT_TOKEN"
if (!$onebotToken) {
  $onebotToken = "openclaw-napcat"
}
$gatewayToken = Get-EnvValue -Path $envFile -Key "OPENCLAW_GATEWAY_TOKEN"

Write-Host "[bootstrap] Ensuring services are running..."
docker compose @composeArgs up -d openclaw-gateway napcat | Out-Null

Write-Host "[bootstrap] Writing NapCat OneBot config..."
$napcatDataDirRaw = Get-EnvValue -Path $envFile -Key "NAPCAT_DATA_DIR"
if (!$napcatDataDirRaw) {
  $napcatDataDirRaw = ".\\data\\napcat"
}
$napcatDataDir = Resolve-StackPath -StackRoot $stackRoot.Path -PathValue $napcatDataDirRaw
$napcatConfigPath = Join-Path $napcatDataDir "config\\onebot11.json"
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $napcatConfigPath) | Out-Null

$napcatOnebotConfig = @"
{
  "network": {
    "httpServers": [
      {
        "enable": true,
        "name": "http",
        "host": "0.0.0.0",
        "port": 3000,
        "enableCors": true,
        "enableWebsocket": false,
        "messagePostFormat": "array",
        "token": "$onebotToken",
        "debug": false
      }
    ],
    "httpSseServers": [],
    "httpClients": [],
    "websocketServers": [
      {
        "enable": true,
        "name": "ws",
        "host": "0.0.0.0",
        "port": 3001,
        "reportSelfMessage": false,
        "enableForcePushEvent": true,
        "messagePostFormat": "array",
        "token": "$onebotToken",
        "debug": false,
        "heartInterval": 30000
      }
    ],
    "websocketClients": [],
    "plugins": []
  },
  "musicSignUrl": "",
  "enableLocalFile2Url": false,
  "parseMultMsg": false
}
"@

[System.IO.File]::WriteAllText(
  $napcatConfigPath,
  $napcatOnebotConfig,
  (New-Object System.Text.UTF8Encoding($false))
)

Write-Host "[bootstrap] Restarting NapCat..."
docker compose @composeArgs restart napcat | Out-Null

$napcatContainerId = (docker compose @composeArgs ps -q napcat).Trim()
if ($napcatContainerId) {
  Wait-ContainerRunning -ContainerId $napcatContainerId -TimeoutSec 90
}

Write-Host "[bootstrap] Installing OpenClaw plugin (onebot) into the gateway container..."
$onebotSrcDir = Resolve-Path (Join-Path $stackRoot "extensions\\onebot")
$gatewayContainerId = (docker compose @composeArgs ps -q openclaw-gateway).Trim()
if (-not $gatewayContainerId) {
  throw "[bootstrap] Cannot find openclaw-gateway container id. Is the gateway running?"
}

docker exec -u root $gatewayContainerId sh -lc "mkdir -p /home/node/.openclaw/extensions && chmod 755 /home/node/.openclaw/extensions && rm -rf /home/node/.openclaw/extensions/onebot" | Out-Null
docker cp $onebotSrcDir.Path "$gatewayContainerId`:/home/node/.openclaw/extensions/onebot" | Out-Null
docker exec -u root $gatewayContainerId sh -lc "chmod -R go-w /home/node/.openclaw/extensions/onebot || true" | Out-Null

Write-Host "[bootstrap] Seeding OpenClaw defaults (setup)..."
docker compose @composeArgs run -T --rm openclaw-cli setup | Out-Null

Write-Host "[bootstrap] Syncing OpenClaw gateway token (.env -> openclaw.json)..."
if (-not $gatewayToken -or $gatewayToken -eq "change-me") {
  Write-Warning "[bootstrap] OPENCLAW_GATEWAY_TOKEN is missing or still 'change-me'. Dashboard/CLI auth may fail."
} else {
  docker compose @composeArgs run -T --rm openclaw-cli config set gateway.auth.mode token | Out-Null
  docker compose @composeArgs run -T --rm openclaw-cli config set gateway.auth.token $gatewayToken | Out-Null
}

Write-Host "[bootstrap] Writing OpenClaw config for OneBot channel..."
docker compose @composeArgs run -T --rm openclaw-cli config set plugins.entries.onebot.enabled true | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set plugins.allow '["onebot"]' --strict-json | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set channels.onebot.wsUrl "ws://napcat:3001" | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set channels.onebot.httpUrl "http://napcat:3000" | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set channels.onebot.token $onebotToken | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set channels.onebot.enabled true | Out-Null
docker compose @composeArgs run -T --rm openclaw-cli config set channels.onebot.requireMention true | Out-Null

Write-Host "[bootstrap] Restarting OpenClaw gateway..."
docker compose @composeArgs restart openclaw-gateway | Out-Null

$gatewayContainerId = (docker compose @composeArgs ps -q openclaw-gateway).Trim()
if ($gatewayContainerId) {
  Wait-ContainerRunning -ContainerId $gatewayContainerId -TimeoutSec 90
}

Write-Host "[bootstrap] Done. Status:"
docker compose @composeArgs ps
docker compose @composeArgs run -T --rm openclaw-cli channels status
docker compose @composeArgs run -T --rm openclaw-cli dashboard --no-open

