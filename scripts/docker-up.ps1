$registry = $env:NPM_REGISTRY
$repoRoot = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repoRoot '.env'

if ([string]::IsNullOrWhiteSpace($registry) -and (Test-Path $envFile)) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*NPM_REGISTRY\s*=\s*(.*?)\s*$') {
            $registry = $Matches[1].Trim('"').Trim("'")
        }
    }
}

if ([string]::IsNullOrWhiteSpace($registry)) {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
    if ($null -ne $npmCommand) {
        $detectedRegistry = (& npm config get registry 2>$null | Select-Object -First 1)
        if ($LASTEXITCODE -eq 0 -and $detectedRegistry -notin @('null', 'undefined')) {
            $registry = $detectedRegistry
        }
    }
}

if ([string]::IsNullOrWhiteSpace($registry)) {
    $registry = 'https://registry.npmjs.org/'
}

$env:NPM_REGISTRY = $registry

Write-Host "Building with npm registry: $registry"
Push-Location $repoRoot
try {
    docker compose up -d --build
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}