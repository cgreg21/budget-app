$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$NodeVersion = (Get-Content (Join-Path $Root '.nvmrc')).Trim()
$Build = Join-Path $Root 'build\windows'
$App = Join-Path $Build 'Budget-App'
$NodeZip = Join-Path $Build 'node.zip'
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"

Remove-Item $Build -Recurse -Force -ErrorAction SilentlyContinue
New-Item $Build -ItemType Directory -Force | Out-Null

Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip
Expand-Archive -Path $NodeZip -DestinationPath $Build
Rename-Item (Join-Path $Build "node-v$NodeVersion-win-x64") (Join-Path $Build 'node')

Push-Location $Root
try {
  & (Join-Path $Build 'node\npm.cmd') ci
  & (Join-Path $Build 'node\npm.cmd') run build
} finally {
  Pop-Location
}

New-Item (Join-Path $App 'app') -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $Root 'dist') (Join-Path $App 'app') -Recurse
Copy-Item (Join-Path $Root 'assets') (Join-Path $App 'app') -Recurse
Copy-Item (Join-Path $Root 'style.css') (Join-Path $App 'app')
Copy-Item (Join-Path $Root 'node_modules') (Join-Path $App 'app') -Recurse
Copy-Item (Join-Path $Root 'package.json') (Join-Path $App 'app')
Copy-Item (Join-Path $Root 'package-lock.json') (Join-Path $App 'app')
Copy-Item (Join-Path $Root 'assets\icons\com.arkdev.BudgetApp.svg') (Join-Path $App 'Budget-App.svg')

& (Join-Path $Build 'node\npm.cmd') prune --omit=dev --prefix (Join-Path $App 'app')

$NodeAbi = & (Join-Path $Build 'node\node.exe') -e "process.stdout.write(process.versions.modules)"
$GtkBinding = Join-Path $App "app\node_modules\node-gtk\lib\binding\node-v$NodeAbi-win32-x64\node_gtk.node"
if (-not (Test-Path $GtkBinding)) {
  throw "node-gtk native binding for Node ABI $NodeAbi not found at $GtkBinding. The bundled node.exe (v$NodeVersion) does not match the compiled node-gtk module; check that node_modules was installed with this same Node version."
}

@'
@echo off
set "HERE=%~dp0"
cd /d "%HERE%app"
"%HERE%node\node.exe" --import node-gtk/register dist\main.js %*
'@ | Set-Content (Join-Path $App 'Budget App.cmd') -Encoding ascii

$Archive = Join-Path $Root 'Budget-App-windows-x64.zip'
Remove-Item $Archive -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $App '*'), (Join-Path $Build 'node') -DestinationPath $Archive
Write-Host "Created $Archive"
