[CmdletBinding()]
param(
  [Parameter()]
  [string]$AppRoot = "",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$RuntimeEnvPath = "C:\ProgramData\EasternStateKPI\runtime.env",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$DataDirectory = "C:\Database\data",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$LogDirectory = "C:\ProgramData\EasternStateKPI\logs",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$BackupDirectory = "C:\Database\backups",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$TaskName = "EasternStateKPI",

  [Parameter()]
  [switch]$PrepareOnly,

  [Parameter()]
  [switch]$Start
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$CurrentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$CurrentPrincipal = New-Object Security.Principal.WindowsPrincipal($CurrentIdentity)
if (-not $CurrentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run this registration script from an Administrator PowerShell session."
}

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $AppRoot) {
  $AppRoot = Split-Path -Parent $ScriptDirectory
}
$AppRoot = [IO.Path]::GetFullPath($AppRoot)
$RuntimeEnvPath = [IO.Path]::GetFullPath($RuntimeEnvPath)
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
$LogDirectory = [IO.Path]::GetFullPath($LogDirectory)
$BackupDirectory = [IO.Path]::GetFullPath($BackupDirectory)
$Launcher = Join-Path $AppRoot "scripts\start-windows-production.ps1"
$CacheDirectory = Join-Path $AppRoot ".next\cache"
$NodePath = (Get-Command node.exe -ErrorAction Stop).Source

foreach ($Candidate in @($AppRoot, $RuntimeEnvPath, $DataDirectory, $LogDirectory, $BackupDirectory, $Launcher, $NodePath)) {
  if ($Candidate.StartsWith("\\") -or $Candidate.Contains('"')) {
    throw "Windows deployment paths must be local fixed-disk paths without quote characters."
  }
}
if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "The application checkout does not contain the Windows production launcher."
}

New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
$RuntimeDirectory = Split-Path -Parent $RuntimeEnvPath
New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $RuntimeEnvPath)) {
  New-Item -ItemType File -Path $RuntimeEnvPath | Out-Null
}
if (-not (Test-Path -LiteralPath $RuntimeEnvPath -PathType Leaf)) {
  throw "The runtime environment path is not a regular file."
}

function Invoke-CheckedIcacls {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & "$env:SystemRoot\System32\icacls.exe" @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Windows ACL hardening failed."
  }
}

# Locale-independent security identifiers:
# Administrators=S-1-5-32-544, SYSTEM=S-1-5-18, LOCAL SERVICE=S-1-5-19.
Invoke-CheckedIcacls @(
  $AppRoot, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)RX",
  "/T", "/C"
)
Invoke-CheckedIcacls @(
  $CacheDirectory, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M",
  "/T", "/C"
)
Invoke-CheckedIcacls @(
  $DataDirectory, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M",
  "/T", "/C"
)
Invoke-CheckedIcacls @(
  $LogDirectory, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)M",
  "/T", "/C"
)
Invoke-CheckedIcacls @(
  $BackupDirectory, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F",
  "/T", "/C"
)
Invoke-CheckedIcacls @(
  $RuntimeDirectory, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:(OI)(CI)F", "*S-1-5-18:(OI)(CI)F", "*S-1-5-19:(OI)(CI)RX"
)
Invoke-CheckedIcacls @(
  $RuntimeEnvPath, "/inheritance:r", "/grant:r",
  "*S-1-5-32-544:F", "*S-1-5-18:F", "*S-1-5-19:R"
)

if ($PrepareOnly) {
  Write-Host "Windows directories and ACLs prepared; no startup task was registered."
  Write-Host "Populate the access-restricted runtime file, run preflight, then register startup."
  return
}

if ((Get-Item -LiteralPath $RuntimeEnvPath).Length -eq 0) {
  throw "Populate the access-restricted runtime environment file before registering startup."
}
$NodeLauncher = Join-Path $AppRoot "scripts\start-windows-production.mjs"
& $NodePath $NodeLauncher --check "--env-file=$RuntimeEnvPath"
if ($LASTEXITCODE -ne 0) {
  throw "The native Windows runtime preflight refused this configuration."
}
if (-not (Test-Path -LiteralPath (Join-Path $AppRoot ".next\BUILD_ID") -PathType Leaf)) {
  throw "Build the production application before registering startup."
}

$PowerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$ActionArguments = @(
  "-NoLogo",
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-File", ('"{0}"' -f $Launcher),
  "-RuntimeEnvPath", ('"{0}"' -f $RuntimeEnvPath),
  "-LogDirectory", ('"{0}"' -f $LogDirectory),
  "-NodePath", ('"{0}"' -f $NodePath)
) -join " "

$Action = New-ScheduledTaskAction `
  -Execute $PowerShellPath `
  -Argument $ActionArguments `
  -WorkingDirectory $AppRoot
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal `
  -UserId "S-1-5-19" `
  -LogonType ServiceAccount `
  -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 10 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "Eastern State KPI native Windows production server" `
  -Force | Out-Null

if ($Start) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Windows startup task registered."
Write-Host "Task: $TaskName"
Write-Host "Run identity: LOCAL SERVICE"
Write-Host "Application binding: 127.0.0.1 on the PORT in runtime.env"
