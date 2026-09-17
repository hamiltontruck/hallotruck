param(
  [string]$SupabaseUrl = $env:SUPABASE_URL,
  [string]$SupabasePublishableKey = $env:SUPABASE_PUBLISHABLE_KEY
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Get-Command flutter -ErrorAction SilentlyContinue)) {
  throw 'Flutter is not on PATH.'
}
if ([string]::IsNullOrWhiteSpace($SupabaseUrl)) {
  throw 'SUPABASE_URL is missing. Set the environment variable or pass -SupabaseUrl.'
}
if ([string]::IsNullOrWhiteSpace($SupabasePublishableKey)) {
  throw 'SUPABASE_PUBLISHABLE_KEY is missing. Set the environment variable or pass -SupabasePublishableKey.'
}

flutter run `
  --dart-define="SUPABASE_URL=$SupabaseUrl" `
  --dart-define="SUPABASE_PUBLISHABLE_KEY=$SupabasePublishableKey"
