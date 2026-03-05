$ErrorActionPreference = "Stop"

$stackRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $stackRoot ".env"
$envExample = Join-Path $stackRoot ".env.example"

if (!(Test-Path $envFile)) {
  Copy-Item -Force $envExample $envFile
  Write-Host "Created .env from .env.example."
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

docker compose @composeArgs run -T --rm openclaw-cli dashboard --no-open

