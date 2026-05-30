# Run once in PowerShell *as Administrator* so phones on your LAN can reach the API.
# Usage: .\scripts\allow-firewall-port.ps1
#        .\scripts\allow-firewall-port.ps1 -Port 5000

param([int]$Port = 5000)

$ruleName = "DineIN Backend TCP $Port"

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Firewall rule already exists: $ruleName"
  exit 0
}

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort $Port `
  -Profile Private, Domain

Write-Host "Created inbound allow rule for TCP port $Port (Private + Domain profiles)."
Write-Host "If your Wi-Fi is 'Public', switch it to Private in Windows Settings or run:"
Write-Host "  New-NetFirewallRule -DisplayName '$ruleName Public' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Public"
