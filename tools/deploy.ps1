<#
.SYNOPSIS
  Build DM Tome and copy the .snplg to the Supernote's MyStyle folder over USB.

.DESCRIPTION
  The Supernote appears in Windows as an MTP device (This PC > Supernote A5 X2
  Manta > Internal shared storage), not as a drive letter, so normal file
  commands cannot reach it. This script drives Windows Explorer's own object
  model (Shell.Application) to locate the device and copy the file, the same
  way a drag and drop in Explorer does.

.PARAMETER NoBuild
  Skip the build and send whatever is already in build\outputs.

.PARAMETER BuildOnly
  Build but do not touch the device.

.PARAMETER DeviceName
  Substring of the device name as shown under This PC. Default "Supernote".

.EXAMPLE
  .\tools\deploy.ps1            # build, then copy
  .\tools\deploy.ps1 -NoBuild   # copy the last build
#>
[CmdletBinding()]
param(
  [switch]$NoBuild,
  [switch]$BuildOnly,
  [string]$DeviceName = 'Supernote',
  [string]$StorageName = 'Internal shared storage',
  [string]$TargetFolder = 'MyStyle'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

function Step($msg)  { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "    $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host ""; Write-Host "FAILED: $msg" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- build
$config = Get-Content (Join-Path $root 'PluginConfig.json') -Raw | ConvertFrom-Json
$pluginName = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).name
$built = Join-Path $root "build\outputs\$pluginName.snplg"

if (-not $NoBuild) {
  Step "Checking toolchain"
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "node is not on PATH. Install Node.js LTS (winget install OpenJS.NodeJS.LTS) and reopen this window."
  }
  Ok "node $(node -v)"

  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Step "Installing dependencies (first run only)"
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
  }

  Step "Building $pluginName $($config.versionName) (versionCode $($config.versionCode))"
  if (Test-Path $built) { Remove-Item $built -Force }
  & (Join-Path $root 'buildPlugin.ps1')
  if (-not (Test-Path $built)) { Fail "build did not produce $built. Scroll up for the first red line." }
  Ok "built $built ($([math]::Round((Get-Item $built).Length / 1KB)) KB)"
}
else {
  if (-not (Test-Path $built)) { Fail "no previous build at $built. Run without -NoBuild." }
}

if ($BuildOnly) { Write-Host ""; Ok "Build only. Done."; exit 0 }

# Stage a versioned copy so each upload has a unique name on the device.
# MTP overwrite prompts are unreliable, and the version in the file name
# also tells you which build you are picking in Settings > Apps > Plugins.
$stageDir = Join-Path $env:TEMP 'supernote-deploy'
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
$stagedName = "$pluginName-$($config.versionName).snplg"
$staged = Join-Path $stageDir $stagedName
Copy-Item $built $staged -Force

# ---------------------------------------------------------------- locate device
Step "Looking for the Supernote under This PC"
$shell = New-Object -ComObject Shell.Application
$thisPc = $shell.NameSpace(17)   # ssfDRIVES = "This PC"

$device = $null
$deadline = (Get-Date).AddSeconds(20)
while (-not $device -and (Get-Date) -lt $deadline) {
  $device = @($thisPc.Items() | Where-Object { $_.Name -like "*$DeviceName*" }) | Select-Object -First 1
  if (-not $device) { Start-Sleep -Seconds 2 }
}
if (-not $device) {
  $names = ($thisPc.Items() | ForEach-Object { $_.Name }) -join ', '
  Fail "no device matching '$DeviceName' under This PC. Seen: $names`n    Plug the USB cable in, unlock the Supernote, and choose 'Transfer files' if it asks."
}
Ok "device: $($device.Name)"

$storage = @($device.GetFolder.Items() | Where-Object { $_.Name -like "*$StorageName*" }) | Select-Object -First 1
if (-not $storage) {
  $names = ($device.GetFolder.Items() | ForEach-Object { $_.Name }) -join ', '
  Fail "no storage named '$StorageName' on the device. Seen: $names`n    The device may still be locked or in 'Charge only' mode."
}
Ok "storage: $($storage.Name)"

$target = $storage.GetFolder.ParseName($TargetFolder)
if (-not $target) {
  $names = ($storage.GetFolder.Items() | ForEach-Object { $_.Name }) -join ', '
  Fail "no '$TargetFolder' folder in $($storage.Name). Seen: $names"
}
$targetFolder = $target.GetFolder
Ok "folder: $($target.Name)"

$existing = @($targetFolder.Items() | Where-Object { $_.Name -like "$pluginName*.snplg" })
if ($existing.Count -gt 0) {
  Warn "already on device: $(($existing | ForEach-Object { $_.Name }) -join ', ')"
}

# ---------------------------------------------------------------- copy
Step "Copying $stagedName to the device"
$srcItem = $shell.NameSpace($stageDir).ParseName($stagedName)
if (-not $srcItem) { Fail "could not read staged file $staged" }

# 16 = answer Yes to any overwrite prompt. Explorer performs the copy
# asynchronously, so poll until the file shows up with the right size.
$targetFolder.CopyHere($srcItem, 16)

$copied = $null
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1
  $copied = $targetFolder.ParseName($stagedName)
  if ($copied) { break }
}
# Explorer may still be streaming bytes when the entry first appears.
Start-Sleep -Seconds 2
if (-not $copied) { Fail "the file never appeared in $TargetFolder. Check the device screen for a prompt, then run again with -NoBuild." }
Ok "on device: $($copied.Name)"

Write-Host ""
Write-Host "Done. On the Supernote:" -ForegroundColor Green
Write-Host "  Settings > Apps > Plugins > Add Plugin > $stagedName > Install"
Write-Host "  If an older DM Tome is installed, remove it there first if the install is refused."
if ($existing.Count -gt 0) {
  Write-Host "  Older uploads in MyStyle can be deleted from the device's file manager or in Explorer."
}
