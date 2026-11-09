# Builds dist\Lexis\Lexis.exe and (if Inno Setup is installed) the installer LexisSetup-<version>.exe.
# Requirements on the build PC: Python 3.12, Node.js 20+, optional Inno Setup 6 (iscc on PATH).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "1/4 Building the frontend..." -ForegroundColor Cyan
Push-Location "$root\frontend"; npm ci; npm run build; Pop-Location

Write-Host "2/4 Preparing Python environment..." -ForegroundColor Cyan
Push-Location "$root\backend"
if (-not (Test-Path .venv)) { py -3.12 -m venv .venv }
.\.venv\Scripts\pip install -q -r requirements.txt pyinstaller
Write-Host "3/4 Running backend tests..." -ForegroundColor Cyan
.\.venv\Scripts\pip install -q -r requirements-dev.txt
.\.venv\Scripts\python -m pytest -q
Pop-Location

Write-Host "4/4 Packaging..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
& "$root\backend\.venv\Scripts\pyinstaller" --noconfirm --distpath "$PSScriptRoot\dist" --workpath "$PSScriptRoot\build" lexis.spec
if (Get-Command iscc -ErrorAction SilentlyContinue) { iscc installer.iss } else { Write-Host "Inno Setup not found - skipping installer; dist\Lexis is a portable folder." -ForegroundColor Yellow }
Pop-Location
Write-Host "Done." -ForegroundColor Green
