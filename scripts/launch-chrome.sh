#!/bin/bash
# Launch Chrome with Chrome DevTools Protocol (CDP) enabled
# This allows browser-mcp-proxy to connect and control the browser

PORT="${1:-9222}"
CHROME_PATH=""

# Auto-detect Chrome path
if [ "$(uname)" = "Darwin" ]; then
    # macOS
    if [ -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
        CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    fi
elif command -v google-chrome &> /dev/null; then
    CHROME_PATH="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME_PATH="google-chrome-stable"
elif command -v chromium-browser &> /dev/null; then
    CHROME_PATH="chromium-browser"
fi

if [ -z "$CHROME_PATH" ]; then
    echo "Error: Chrome not found. Install Google Chrome and try again."
    exit 1
fi

# Check if CDP port is already in use
if lsof -i :"$PORT" &> /dev/null; then
    echo "Chrome CDP is already running on port $PORT"
    echo "You can connect browser-mcp-proxy now."
    exit 0
fi

echo "Launching Chrome with CDP on port $PORT..."
"$CHROME_PATH" --remote-debugging-port="$PORT" --no-first-run &
echo "Chrome launched (PID: $!)"
echo ""
echo "You can now start browser-mcp-proxy."
echo "To verify: curl -s http://localhost:$PORT/json/version"
