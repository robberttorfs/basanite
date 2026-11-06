# Loaded into Basanite terminal tiles (PowerShell). Running `claude` here adds
# Basanite's hook settings, so the tile becomes a full Basanite session while
# Claude Code runs and turns back into a terminal when it exits.
function global:__HangarInteractive($a) {
  foreach ($x in $a) { if ("$x" -in '-p', '--print', '-v', '--version', '-h', '--help') { return $false } }
  if ($a.Count -and "$($a[0])" -in 'mcp', 'config', 'doctor', 'update', 'upgrade', 'install', 'plugin', 'plugins', 'setup-token', 'migrate-installer', 'auth', 'agents') { return $false }
  return $true
}
function global:claude {
  $real = Get-Command -Name claude -CommandType Application, ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $real) { Write-Host 'claude was not found on your PATH.' -ForegroundColor Yellow; return }
  if (-not $env:HANGAR_SETTINGS -or -not (__HangarInteractive $args)) { & $real.Source @args; return }
  try { & $real.Source --settings $env:HANGAR_SETTINGS @args }
  finally { try { Invoke-RestMethod -Method Post -Uri (Get-Content -Raw $env:HANGAR_DETACH_FILE).Trim() -TimeoutSec 2 | Out-Null } catch {} }
}
