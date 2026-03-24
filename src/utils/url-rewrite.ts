/**
 * Rewrite URLs to more scraping-friendly versions.
 * e.g. Reddit's modern SPA → old.reddit.com (server-rendered HTML).
 */
const rewriters: Array<{ match: RegExp; rewrite: (url: URL) => string }> = [
  {
    // www.reddit.com or reddit.com → old.reddit.com
    match: /^(www\.)?reddit\.com$/,
    rewrite: (url) => {
      url.hostname = "old.reddit.com";
      return url.toString();
    },
  },
];

export function rewriteUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const r of rewriters) {
      if (r.match.test(url.hostname)) {
        return r.rewrite(url);
      }
    }
  } catch {
    // Invalid URL — return as-is
  }
  return raw;
}
