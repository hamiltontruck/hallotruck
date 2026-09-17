$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter is not on PATH. Install Flutter 3.35+ with Dart 3.9+ first.'
}

flutter --version
flutter create . --platforms=android --org com.hallo.logistics --project-name hallo_driver_flutter
flutter pub get
flutter test
flutter analyze

Write-Host 'Flutter Android host generated. Next run tool\run_android.ps1 with Supabase dart-defines.'
