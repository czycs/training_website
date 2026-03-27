param(
  [string]$ExercisesDir = "data/exercises",
  [string]$OutputFile = "data/exercises/index.json"
)

$root = Split-Path -Parent $PSScriptRoot
$exercisePath = Join-Path $root $ExercisesDir
$outputPath = Join-Path $root $OutputFile

if (-not (Test-Path $exercisePath)) {
  Write-Error "Exercises directory not found: $exercisePath"
  exit 1
}

$files = Get-ChildItem -Path $exercisePath -Filter *.md |
  Sort-Object Name |
  Select-Object -ExpandProperty Name

$json = $files | ConvertTo-Json
$json | Set-Content -Path $outputPath

Write-Host "Updated $OutputFile with $($files.Count) exercise files."
