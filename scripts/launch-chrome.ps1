# Launch Chrome with Chrome DevTools Protocol (CDP) enabled
# This allows browser-mcp-proxy to connect and control the browser

param([int]$Port = 9222)

$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

if (-not $chromePath) {
    Write-Error "Chrome not found. Install Google Chrome and try again."
    exit 1
}

# Check if port is already in use
$portInUse = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "Chrome CDP is already running on port $Port"
    Write-Host "You can connect browser-mcp-proxy now."
    exit 0
}

Write-Host "Launching Chrome with CDP on port $Port..."
Start-Process $chromePath -ArgumentList "--remote-debugging-port=$Port", "--no-first-run"
Write-Host ""
Write-Host "Chrome launched. You can now start browser-mcp-proxy."
Write-Host "To verify: curl http://localhost:${Port}/json/version"
