import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ReadableContent {
  title: string;
  byline: string | null;
  content: string; // HTML
  excerpt: string | null;
}

export function extractReadableContent(html: string, url: string): ReadableContent | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const result = reader.parse();

  if (!result) return null;

  return {
    title: result.title,
    byline: result.byline,
    content: result.content,
    excerpt: result.excerpt,
  };
}
