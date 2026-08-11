$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    docker compose pull
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
    docker compose up -d --remove-orphans
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}