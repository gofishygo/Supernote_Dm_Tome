<#
.SYNOPSIS
  Copy a file to a Supernote's MyStyle folder over USB from Windows.

.DESCRIPTION
  Supernote devices mount as MTP, not as a drive letter, so Copy-Item cannot
  reach them. This uses Windows Explorer's object model (Shell.Application) to
  find the device under This PC and copy the file, like a drag and drop.

.EXAMPLE
  .\push_to_supernote.ps1 -File .\build\outputs\MyPlugin.snplg
  .\push_to_supernote.ps1 -File .\x.snplg -DeviceName Nomad -TargetFolder MyStyle
#>
param(
  [Parameter(Mandatory = $true)][string]$File,
  [string]$DeviceName = 'Supernote',
  [string]$StorageName = 'Internal shared storage',
  [string]$TargetFolder = 'MyStyle',
  [int]$TimeoutSeconds = 90
)
$ErrorActionPreference = 'Stop'
$File = (Resolve-Path $File).Path
$name = Split-Path -Leaf $File
$dir = Split-Path -Parent $File

$shell = New-Object -ComObject Shell.Application
$thisPc = $shell.NameSpace(17)
$device = @($thisPc.Items() | Where-Object { $_.Name -like "*$DeviceName*" }) | Select-Object -First 1
if (-not $device) { throw "No device matching '$DeviceName' under This PC. Seen: $(($thisPc.Items() | % Name) -join ', ')" }
$storage = @($device.GetFolder.Items() | Where-Object { $_.Name -like "*$StorageName*" }) | Select-Object -First 1
if (-not $storage) { throw "No storage '$StorageName' on $($device.Name). Seen: $(($device.GetFolder.Items() | % Name) -join ', ')" }
$target = $storage.GetFolder.ParseName($TargetFolder)
if (-not $target) { throw "No folder '$TargetFolder' in $($storage.Name)." }

$src = $shell.NameSpace($dir).ParseName($name)
$target.GetFolder.CopyHere($src, 16)   # 16 = yes to overwrite prompts; copy is async
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do { Start-Sleep 1; $done = $target.GetFolder.ParseName($name) } until ($done -or (Get-Date) -gt $deadline)
if (-not $done) { throw "Timed out waiting for $name to appear in $TargetFolder." }
Start-Sleep 2
Write-Host "Copied $name to $($device.Name)\$($storage.Name)\$TargetFolder"
