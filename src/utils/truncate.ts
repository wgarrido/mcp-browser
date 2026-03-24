const SUFFIX_TEMPLATE = "\n\n[... content truncated, XXXXXXX characters remaining]";
const SUFFIX_OVERHEAD = SUFFIX_TEMPLATE.length;

export function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  // Reserve space for the suffix so total output stays within maxLength
  const budget = Math.max(0, maxLength - SUFFIX_OVERHEAD);

  // Try to cut at a paragraph boundary
  const parBreak = text.lastIndexOf("\n\n", budget);
  // Fallback to a line boundary
  const lineBreak = parBreak > budget * 0.5 ? parBreak : text.lastIndexOf("\n", budget);
  // Fallback to a space
  const space = lineBreak > budget * 0.5 ? lineBreak : text.lastIndexOf(" ", budget);
  // Final fallback: hard cut
  const cutPoint = space > budget * 0.3 ? space : budget;

  const remaining = text.length - cutPoint;
  return text.slice(0, cutPoint) + `\n\n[... content truncated, ${remaining} characters remaining]`;
}
