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

> **Important:** Chrome must be started fresh — if it's already running, the CDP flag is ignored. Either quit Chrome first, or use a separate profile:
> ```bash
> "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --no-first-run --user-data-dir="/tmp/chrome-cdp-profile"
> ```

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

### Core

| Tool | Description |
|---|---|
| `fetch_page` | Load a URL and return the full page content as Markdown |
| `fetch_readable` | Extract the main article content using Readability (strips navigation, ads, sidebars). Falls back to full content if extraction is too short |
| `web_search` | Search Google/DuckDuckGo via the browser. Returns `{title, url, snippet}[]` |
| `screenshot` | Take a PNG screenshot of a page or a specific CSS element |
| `execute_javascript` | Execute arbitrary JavaScript in the browser context and return the result |
| `fetch_structured_data` | Extract JSON-LD, OpenGraph, meta tags, tables, headings, and links |
| `multi_fetch` | Fetch up to 5 URLs in parallel and return their content as Markdown |
| `extract_links` | Extract all links from a page with optional regex filtering |
| `crawl` | Crawl a website following links up to a max depth/pages, with optional content extraction |
| `browser_status` | Check if the browser connection is active |

### Persistent Sessions

Open long-lived browser tabs for multi-step workflows (login, form filling, navigation chains).

| Tool | Description |
|---|---|
| `open_tab` | Open a new persistent tab, returns a `tab_id` |
| `close_tab` | Close a persistent tab by `tab_id` |
| `click_and_navigate` | Interact with a tab: click, type, select, submit, scroll |
| `list_tabs` | List all open browser tabs |
| `monitor_page` | Monitor a page for content changes (start/check/stop/list) |

Most tools accept an optional `tab_id` parameter to reuse a persistent session instead of opening a new ephemeral page. This is useful for sites that require authentication or multi-step interactions.

## Usage Examples

Once configured, just use natural language with your LLM:

- **"Search for the latest Node.js release notes"** — calls `web_search`, then `fetch_page` on the top results
- **"Read this page and summarize it: https://example.com/article"** — calls `fetch_readable`
- **"Compare the pricing on these two pages"** — calls `multi_fetch` on both URLs
- **"Take a screenshot of https://example.com"** — calls `screenshot`
- **"Open a tab on https://example.com, click the login button, type my credentials"** — uses `open_tab` + `click_and_navigate`
- **"Extract all links from this page that match /docs/"** — calls `extract_links` with a filter
- **"Crawl this site 2 levels deep"** — calls `crawl`
- **"Monitor this page every 30 seconds for changes"** — calls `monitor_page`

## Features

- **Anti-bot detection**: Hides the `navigator.webdriver` flag to bypass bot checks
- **Cloudflare challenge handling**: Automatically detects and waits for Cloudflare Turnstile/interstitial pages to resolve (up to 15s)
- **Cookie/consent dismissal**: Automatically clicks "Accept cookies" overlays (Reddit, GDPR, OneTrust, CookieBot, etc.)
- **DOM cleaning**: Strips navigation, sidebars, footers, ads, and action links before extraction
- **URL rewriting**: Redirects SPAs to scraping-friendly versions (e.g. `reddit.com` → `old.reddit.com`)
- **Google → DuckDuckGo fallback**: If Google shows a CAPTCHA, search falls back to DuckDuckGo automatically
- **Persistent sessions**: Keep tabs open across multiple tool calls for multi-step workflows
- **LRU cache**: Caches page content to avoid redundant fetches (configurable TTL)
- **Concurrency control**: Semaphore limits concurrent browser tabs to prevent resource exhaustion
- **Multi-profile support**: Connect to multiple Chrome instances via named profiles

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
| `SESSION_TIMEOUT_MINUTES` | `30` | Auto-close inactive sessions after this duration |
| `CHROME_PROFILES` | `{}` | JSON map of profile name → CDP URL (e.g. `{"work":"http://localhost:9223"}`) |

Pass them in the MCP config:
```json
{
  "mcpServers": {
    "browser-proxy": {
      "command": "node",
      "args": ["/path/to/browser-mcp-proxy/dist/index.js"],
      "env": {
        "SEARCH_ENGINE": "duckduckgo",
        "DEFAULT_TIMEOUT": "60000",
        "SESSION_TIMEOUT_MINUTES": "60"
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

**"Cloudflare challenge page"**
The server automatically waits up to 15s for Cloudflare challenges to resolve. If the site requires manual verification, use `open_tab` to create a persistent session, solve the challenge in Chrome, then use the `tab_id` with other tools.

## Requirements

- Node.js 18+
- Google Chrome (or Chromium)

## License

MIT
