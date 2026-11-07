# TribeCode desktop helper: install / update / clean / launch. Used by TribeCode.bat and the auto-update task.
#   -Launch   open TribeCode afterwards
#   -Quiet    never interrupt: skip the update if TribeCode is open, print little
#   -Clean    remove old installers, obsolete launchers and the old v0.1 code copy (keeps tribe data)
param([switch]$Launch, [switch]$Quiet, [switch]$Clean)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = 'Tls12'
$repo   = 'orionopenwow/TribeCode'
$home2  = Split-Path -Parent $PSScriptRoot          # Desktop\TribeCode
$exe    = Join-Path $env:LOCALAPPDATA 'TribeCode\tribecode.exe'
function Say($m) { if (-not $Quiet) { Write-Host "  $m" } }
function Ver($s) { try { [version](($s -replace '^v','') -replace '[^0-9.].*$','') } catch { [version]'0.0' } }

# ---------- clean ----------
if ($Clean) {
  Get-ChildItem $home2 -Filter 'TribeCode_*_x64-setup.exe' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  foreach ($f in 'latest.txt','Get-Latest-TribeCode.bat','Reset-Old-TribeCode.bat','TribeCode-Start-Test-Project.bat','New-Project-For-A-Friend.bat') {
    $p = Join-Path $home2 $f; if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue }
  }
  $stable = Join-Path $home2 'Stable'
  if ((Test-Path $stable) -and -not (Test-Path (Join-Path $stable 'TribeCode\.git'))) { Remove-Item $stable -Recurse -Force -ErrorAction SilentlyContinue }
  # The old v0.1 code copy that shared %USERPROFILE%\TribeCode with the tribe data: remove only the code, keep the tribe.
  $old = Join-Path $env:USERPROFILE 'TribeCode'
  if ((Test-Path (Join-Path $old '.git')) -and (Test-Path (Join-Path $old 'server\index.js'))) {
    $remote = ''; try { $remote = (git -C $old remote get-url origin) 2>$null } catch {}
    if ($remote -match 'orionopenwow/TribeCode') {
      foreach ($d in '.git','.github','server','app','scripts','assets','design','node_modules') { $p = Join-Path $old $d; if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } }
      foreach ($f in 'package.json','package-lock.json','README.md','CHANGELOG.md','LICENSE','.gitignore','TribeCode-Live-Test.bat','TribeCode-Invite-Friend.bat','TribeCode-Start-Test-Project.bat') { $p = Join-Path $old $f; if (Test-Path $p) { Remove-Item $p -Force -ErrorAction SilentlyContinue } }
      Say "Removed the old code copy from $old (your tribe data stays)."
    }
  }
}

# The desktop app's built-in browser cached old pages in a service worker (fixed in the app from v0.4.1).
# Clear those caches while TribeCode is closed. Settings and sign-in (Local Storage) are kept.
function Clear-WebCache {
  if (Get-Process -Name tribecode -ErrorAction SilentlyContinue) { return }
  $prof = Join-Path $env:LOCALAPPDATA 'dev.tribecode.desktop\EBWebView\Default'
  foreach ($d in 'Service Worker','Cache','Code Cache','GPUCache') { $p = Join-Path $prof $d; if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } }
}
if ($Clean) { Clear-WebCache }

# ---------- update ----------
$installed = if (Test-Path $exe) { Ver ((Get-Item $exe).VersionInfo.ProductVersion) } else { [version]'0.0' }
$rel = $null
try { $rel = Invoke-RestMethod -Headers @{ 'User-Agent' = 'TribeCode-updater' } "https://api.github.com/repos/$repo/releases/latest" -TimeoutSec 20 } catch { Say "Couldn't reach GitHub to check for updates ($($_.Exception.Message))." }
if ($rel) {
  $latest = Ver $rel.tag_name
  $asset  = $rel.assets | Where-Object { $_.name -like '*_x64-setup.exe' } | Select-Object -First 1
  if ($asset -and $latest -gt $installed) {
    $running = Get-Process -Name tribecode -ErrorAction SilentlyContinue
    if ($running -and $Quiet) { exit 0 }   # never interrupt someone mid-session; the app updates itself on close
    Say ($(if ($installed -eq [version]'0.0') { "Installing TribeCode $($rel.tag_name)..." } else { "Updating TribeCode $installed -> $($rel.tag_name)..." }))
    Get-Process -Name tribecode, tribecode-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
    $setup = Join-Path $env:TEMP $asset.name
    Invoke-WebRequest -UseBasicParsing -Headers @{ 'User-Agent' = 'TribeCode-updater' } $asset.browser_download_url -OutFile $setup
    Start-Process -FilePath $setup -ArgumentList '/S' -Wait
    Remove-Item $setup -Force -ErrorAction SilentlyContinue
    Clear-WebCache
    Say "Done: TribeCode $($rel.tag_name)."
  } elseif ($asset) { Say "TribeCode $installed is the latest." }
}

# ---------- launch ----------
if ($Launch) {
  if (Test-Path $exe) {
    # A stale server from an older copy blocks the new one: the app replaces it itself on start, this just helps.
    Get-Process -Name tribecode-server -ErrorAction SilentlyContinue | Where-Object { -not (Get-Process -Name tribecode -ErrorAction SilentlyContinue) } | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $exe
  } else { Say "TribeCode isn't installed yet and GitHub couldn't be reached. Try again in a minute." ; if (-not $Quiet) { Read-Host '  Press Enter' | Out-Null } }
}
