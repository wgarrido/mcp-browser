<div align="center">

# MCP Browser

**Give your AI a real browser.**

MCP server that lets AI assistants browse the web through your real Chrome — with your cookies, sessions, and fingerprint. No bot detection. No CAPTCHAs.

[![npm version](https://img.shields.io/npm/v/%40wgarrido%2Fmcp-browser.svg)](https://www.npmjs.com/package/@wgarrido/mcp-browser)
[![npm downloads](https://img.shields.io/npm/dm/%40wgarrido%2Fmcp-browser.svg)](https://www.npmjs.com/package/@wgarrido/mcp-browser)
[![license](https://img.shields.io/npm/l/%40wgarrido%2Fmcp-browser.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/wgarrido/mcp-browser/ci.yml?label=CI)](https://github.com/wgarrido/mcp-browser/actions)

</div>

---

## Quick Start (30 seconds)

No installation needed. Just add the config to your MCP client:

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (Mac/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@wgarrido/mcp-browser"],
      "env": {
        "CHROME_HEADLESS": "true"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add browser -- npx -y @wgarrido/mcp-browser
```

### VS Code / Cursor

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@wgarrido/mcp-browser"],
      "env": {
        "CHROME_HEADLESS": "true"
      }
    }
  }
}
```

That's it. Chrome launches automatically in the background. Start browsing.

---

## Why MCP Browser?

| Problem | How MCP Browser solves it |
|---|---|
| Sites block bots and scrapers | Uses your **real Chrome** with your real fingerprint |
| Cloudflare challenges, CAPTCHAs | **Auto-detects and waits** for challenges to resolve |
| Content behind login | Your **cookies and sessions** are already there |
| Noisy HTML (ads, nav, popups) | **Smart DOM cleaning** strips everything but content |
| Cookie consent banners | **Auto-dismissed** (40+ selector patterns) |
| SPAs with dynamic content | Runs in a **real browser** — JavaScript executes naturally |

---

## Available Tools (15)

### Core

| Tool | What it does |
|---|---|
| `fetch_page` | Load a URL → clean Markdown |
| `fetch_readable` | Extract main article content (Readability) |
| `web_search` | Search Google/DuckDuckGo through the browser |
| `screenshot` | PNG screenshot of a page or CSS element |
| `execute_javascript` | Run arbitrary JS in the page context |
| `fetch_structured_data` | Extract JSON-LD, OpenGraph, meta, tables, headings, links |
| `multi_fetch` | Fetch up to 5 URLs in parallel |
| `extract_links` | Get all links from a page (with regex filter) |
| `crawl` | Crawl a site following links (depth/page limits) |
| `browser_status` | Check browser connection status |

### Persistent Sessions

Keep tabs open across multiple tool calls for multi-step workflows:

| Tool | What it does |
|---|---|
| `open_tab` | Open a persistent tab → returns `tab_id` |
| `close_tab` | Close a tab by `tab_id` |
| `click_and_navigate` | Interact: click, type, select, submit, scroll |
| `list_tabs` | List all open tabs |
| `monitor_page` | Track page changes over time (start/check/stop) |

> Most tools accept an optional `tab_id` to reuse a persistent session instead of opening a new page.

---

## Usage Examples

Just talk naturally to your AI:

- **"Search for the latest Node.js release notes"** → `web_search` + `fetch_page`
- **"Read and summarize this article: https://..."** → `fetch_readable`
- **"Compare pricing on these two pages"** → `multi_fetch`
- **"Take a screenshot of https://..."** → `screenshot`
- **"Log into this site, then scrape my dashboard"** → `open_tab` + `click_and_navigate` + `fetch_page`
- **"Extract all /docs/ links from this page"** → `extract_links`
- **"Crawl this site 2 levels deep"** → `crawl`
- **"Watch this page for changes every 30 seconds"** → `monitor_page`

---

## Advanced: Use Your Own Chrome Sessions

By default, MCP Browser launches Chrome in **headless mode** (background, no window). This is the simplest setup.

If you want to use your **existing cookies and logged-in sessions**, launch Chrome manually with CDP enabled, then point MCP Browser to it:

### Launch Chrome with CDP

**Mac:**
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 --no-first-run
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --no-first-run
```

**Windows (PowerShell):**
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --no-first-run
```

Or use the included scripts:
```bash
./scripts/launch-chrome.sh       # Mac/Linux
.\scripts\launch-chrome.ps1      # Windows
```

> **Important:** Chrome must be started fresh. If it's already running, the CDP flag is ignored. Quit Chrome first, or use `--user-data-dir="/tmp/chrome-cdp"` for a separate profile.

### Config without headless

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@wgarrido/mcp-browser"],
      "env": {
        "CDP_URL": "http://localhost:9222"
      }
    }
  }
}
```

---

## Configuration

All settings are optional. Pass them via `env` in your MCP config:

| Variable | Default | Description |
|---|---|---|
| `CHROME_HEADLESS` | `false` | Auto-launch Chrome in headless mode (recommended) |
| `CHROME_PATH` | *(auto-detect)* | Custom path to Chrome/Chromium executable |
| `CDP_URL` | `http://localhost:9222` | Chrome DevTools Protocol endpoint |
| `DEFAULT_TIMEOUT` | `30000` | Page load timeout in ms |
| `MAX_CONTENT_LENGTH` | `50000` | Max returned content in characters |
| `MAX_CONCURRENT_TABS` | `5` | Max simultaneous browser tabs |
| `CACHE_ENABLED` | `true` | Enable in-memory page cache |
| `CACHE_TTL` | `300` | Cache time-to-live in seconds |
| `SEARCH_ENGINE` | `google` | `google` or `duckduckgo` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `SESSION_TIMEOUT_MINUTES` | `30` | Auto-close inactive tabs after this duration |
| `CHROME_PROFILES` | `{}` | JSON map of profile name → CDP URL |

**Example with custom settings:**

```json
{
  "mcpServers": {
    "browser": {
      "command": "npx",
      "args": ["-y", "@wgarrido/mcp-browser"],
      "env": {
        "CHROME_HEADLESS": "true",
        "SEARCH_ENGINE": "duckduckgo",
        "DEFAULT_TIMEOUT": "60000",
        "MAX_CONTENT_LENGTH": "100000"
      }
    }
  }
}
```

---

## Features

- **Headless mode** — Chrome runs in the background, auto-launched by the server
- **Anti-bot stealth** — Hides `navigator.webdriver`, fakes plugins, languages, and permissions
- **Cloudflare handling** — Detects Turnstile/interstitial challenges and waits up to 15s for resolution
- **Cookie banner dismissal** — Auto-clicks consent overlays (GDPR, OneTrust, CookieBot, Reddit, 40+ patterns)
- **Smart DOM cleaning** — Strips nav, sidebars, footers, ads, modals, and action links
- **URL rewriting** — Redirects SPAs to scraping-friendly versions (e.g. `reddit.com` → `old.reddit.com`)
- **Google → DuckDuckGo fallback** — If Google shows a CAPTCHA, search falls back automatically
- **Persistent sessions** — Keep tabs open for multi-step workflows (login, forms, navigation chains)
- **LRU cache** — Avoids redundant fetches with configurable TTL
- **Concurrency control** — Semaphore limits concurrent tabs to prevent resource exhaustion
- **Multi-profile support** — Connect to multiple Chrome instances via named profiles

---

## Troubleshooting

**"Cannot connect to Chrome"**
Chrome must be running with `--remote-debugging-port=9222`, or set `CHROME_HEADLESS=true` for auto-launch.

**"Port 9222 already in use"**
Another Chrome instance is using CDP. Close it or use a different port:
```bash
./scripts/launch-chrome.sh 9333
```
Then set `CDP_URL=http://localhost:9333`.

**"Page timeout"**
Increase the timeout: `"DEFAULT_TIMEOUT": "60000"`

**"Empty results from web_search"**
Google may show a CAPTCHA. Switch to DuckDuckGo: `"SEARCH_ENGINE": "duckduckgo"`

**"Cloudflare challenge page"**
The server auto-waits up to 15s for Cloudflare challenges. If it needs manual verification, use `open_tab` to create a persistent session, solve it in Chrome, then use the `tab_id` with other tools.

**"MCP error -32000: Connection closed"**
This can have two causes:

1. **Chrome is not running with CDP enabled** — If you're not using `CHROME_HEADLESS=true`, make sure Chrome is launched with `--remote-debugging-port=9222` before starting the server. Verify with:
   ```bash
   curl http://localhost:9222/json/version
   ```
   If this returns an error, Chrome is not listening. See [Launch Chrome with CDP](#launch-chrome-with-cdp).

2. **Corrupted npx cache** — If you see `TypeError: Comparator is not a constructor` in the logs, the npx cache is corrupted. Clear it and retry:
   ```bash
   rm -rf ~/.npm/_npx/*
   # The next npx -y @wgarrido/mcp-browser call will re-download cleanly
   ```

---

## Development

```bash
git clone https://github.com/wgarrido/mcp-browser.git
cd mcp-browser
npm install
npm run dev    # Run with hot reload
npm run build  # Build for production
```

---

## Requirements

- Node.js 18+
- Google Chrome or Chromium

## License

[MIT](LICENSE)
