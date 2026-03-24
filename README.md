# Browser MCP Proxy

MCP server that routes web requests through your real Chrome browser via CDP (Chrome DevTools Protocol). This lets LLMs browse the web as you — with your cookies, sessions, and browser fingerprint — avoiding anti-bot blocks.

## Quick Start

### 1. Install & build

```bash
git clone <repo-url> browser-mcp-proxy
cd browser-mcp-proxy
npm install
npm run build
```

### 2. Launch Chrome with CDP

**Mac:**
```bash
./scripts/launch-chrome.sh
```

**Linux:**
```bash
./scripts/launch-chrome.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\launch-chrome.ps1
```

**Or manually:**
```bash
# Mac
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --no-first-run

# Linux
google-chrome --remote-debugging-port=9222 --no-first-run
```

### 3. Add MCP config

Add this to your MCP client config. Replace `/path/to/browser-mcp-proxy` with the actual path.

**Claude Code (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "browser-proxy": {
      "command": "node",
      "args": ["/path/to/browser-mcp-proxy/dist/index.js"]
    }
  }
}
```

**Cursor / VS Code (`.vscode/mcp.json` already included):**
Open the project in VS Code — the `.vscode/mcp.json` config is ready.

**Claude Code CLI:**
```bash
claude mcp add browser-proxy node /path/to/browser-mcp-proxy/dist/index.js
```

## Available Tools

| Tool | Description |
|---|---|
| `web_search` | Search Google/DuckDuckGo via the browser. Returns `{title, url, snippet}[]` |
| `fetch_page` | Load a URL and return the full page as Markdown |
| `fetch_readable` | Load a URL and extract only the main content (article) as clean Markdown |
| `browser_status` | Check if the browser connection is active |

## Usage Examples

Once configured, just use natural language with your LLM:

- **"Search for the latest Node.js release notes"** — calls `web_search`, then `fetch_readable` on the top results
- **"Read this page and summarize it: https://example.com/article"** — calls `fetch_readable`
- **"Compare the pricing on these two pages"** — calls `fetch_page` on both URLs
- **"Is the browser connected?"** — calls `browser_status`

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CDP_URL` | `http://localhost:9222` | Chrome DevTools Protocol endpoint |
| `DEFAULT_TIMEOUT` | `30000` | Page load timeout (ms) |
| `MAX_CONTENT_LENGTH` | `50000` | Max content length returned (chars) |
| `MAX_CONCURRENT_TABS` | `5` | Max simultaneous browser tabs |
| `CACHE_ENABLED` | `true` | Enable in-memory page cache |
| `CACHE_TTL` | `300` | Cache time-to-live (seconds) |
| `SEARCH_ENGINE` | `google` | Default search engine (`google` or `duckduckgo`) |
| `LOG_LEVEL` | `info` | Log level (`debug`, `info`, `warn`, `error`) |

Pass them in the MCP config:
```json
{
  "mcpServers": {
    "browser-proxy": {
      "command": "node",
      "args": ["/path/to/browser-mcp-proxy/dist/index.js"],
      "env": {
        "SEARCH_ENGINE": "duckduckgo",
        "DEFAULT_TIMEOUT": "60000"
      }
    }
  }
}
```

## Troubleshooting

**"Cannot connect to Chrome"**
Chrome must be running with `--remote-debugging-port=9222`. Use the provided launch scripts or start it manually.

**"Port 9222 already in use"**
Another Chrome instance is already using CDP on that port. Close it or use a different port:
```bash
./scripts/launch-chrome.sh 9333
```
Then set `CDP_URL=http://localhost:9333`.

**"Page timeout"**
Some pages are slow. Increase the timeout:
```json
{ "env": { "DEFAULT_TIMEOUT": "60000" } }
```

**"Empty results from web_search"**
Google may show a CAPTCHA. Try switching to DuckDuckGo:
```json
{ "env": { "SEARCH_ENGINE": "duckduckgo" } }
```

## Requirements

- Node.js 18+
- Google Chrome (or Chromium)

## License

MIT
