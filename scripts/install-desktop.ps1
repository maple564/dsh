param(
  [Parameter(Mandatory=$true)][string]$DshHome,
  [string]$Profile = 'desktop'
)
$ErrorActionPreference = 'Stop'
if ($Profile -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid profile name.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$pluginPath = Join-Path $projectRoot 'dsh-plugin'
$profileRoot = Join-Path (Resolve-Path -LiteralPath $DshHome).Path "profiles/$Profile"
$manifestPath = Join-Path $profileRoot 'package.json'
if (!(Test-Path -LiteralPath $manifestPath)) { throw 'Existing DSH profile not found. Start DSH once or check DSH_HOME/profile.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if (!$manifest.dsh.profile.bundles) { throw 'Profile has no bundle manifest; refusing to replace it.' }
Get-Command pnpm -ErrorAction Stop | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
foreach ($name in @('package.json','pnpm-lock.yaml')) {
  $source = Join-Path $profileRoot $name
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination "$source.cs-backup-$stamp" }
}
& pnpm --dir $profileRoot add "link:$pluginPath"
if ($LASTEXITCODE -ne 0) { throw 'pnpm failed; bundle activation was not changed. Backups remain in the profile.' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.dsh.profile.bundles -notcontains '@local/conversation-structure-ui') {
  $manifest.dsh.profile.bundles += '@local/conversation-structure-ui'
  [IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
}
Write-Output 'Installed. Fully quit and reopen DSH to load the UI. Keep this checkout at its current path.'
