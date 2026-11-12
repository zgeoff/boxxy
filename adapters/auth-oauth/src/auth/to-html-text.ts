// Copied from atc: packages/mcp/src/auth/to-html-text.ts at commit 4fe647cf.

export function toHTMLText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
