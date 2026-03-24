import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

let service: TurndownService | null = null;

function getService(): TurndownService {
  if (service) return service;

  service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Add GFM support (tables, strikethrough, task lists)
  service.use(gfm);

  // Remove unwanted elements
  service.remove(["script", "style", "nav", "footer", "noscript", "iframe"]);

  return service;
}

export function htmlToMarkdown(html: string): string {
  return getService().turndown(html);
}
