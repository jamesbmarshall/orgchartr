Add-Type -AssemblyName System.Windows.Forms

$dialog = [System.Windows.Forms.FolderBrowserDialog]::new()
$dialog.Description = 'Choose the folder where orgchartr will store its data'
$dialog.ShowNewFolderButton = $true

if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host 'No folder selected. Configuration was not changed.'
    exit 0
}

$selectedPath = $dialog.SelectedPath.Replace('\', '/')
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env'
$setting = "ORGCHARTR_DATA_DIR=`"$selectedPath`""
$lines = if (Test-Path $envFile) { @(Get-Content $envFile) } else { @() }
$settingIndex = -1

for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^\s*ORGCHARTR_DATA_DIR\s*=') {
        $settingIndex = $index
        break
    }
}

if ($settingIndex -ge 0) {
    $lines[$settingIndex] = $setting
} else {
    $lines += $setting
}

Set-Content -Path $envFile -Value $lines -Encoding utf8
Write-Host "orgchartr data directory set to: $selectedPath"
Write-Host 'Run docker compose up -d --build to apply it.'