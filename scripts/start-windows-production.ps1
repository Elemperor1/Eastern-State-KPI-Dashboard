[CmdletBinding()]
param(
  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$RuntimeEnvPath = "C:\ProgramData\EasternStateKPI\runtime.env",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$LogDirectory = "C:\ProgramData\EasternStateKPI\logs",

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$NodePath = "node.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Split-Path -Parent $ScriptDirectory
$Launcher = Join-Path $ScriptDirectory "start-windows-production.mjs"

if (-not (Test-Path -LiteralPath $RuntimeEnvPath -PathType Leaf)) {
  throw "The access-restricted runtime environment file is missing."
}
if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
  throw "The Windows production launcher is missing."
}
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf) -and
    -not (Get-Command $NodePath -ErrorAction SilentlyContinue)) {
  throw "The required Node.js executable is unavailable."
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$LogPath = Join-Path $LogDirectory ("server-{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
$TranscriptStarted = $false
$ExitCode = 1

try {
  Start-Transcript -LiteralPath $LogPath -Append | Out-Null
  $TranscriptStarted = $true

  # The reviewed runtime file is authoritative. Do not let machine-wide Node
  # injection variables alter the launcher before it applies that file.
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue

  Set-Location -LiteralPath $AppRoot
  & $NodePath $Launcher "--env-file=$RuntimeEnvPath"
  $ExitCode = $LASTEXITCODE
}
finally {
  if ($TranscriptStarted) {
    Stop-Transcript | Out-Null
  }
}

exit $ExitCode
