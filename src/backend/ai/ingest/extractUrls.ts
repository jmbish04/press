/**
 * @fileoverview Rigorous URL extraction from free-form text.
 *
 * Handles raw dumps from an iOS share sheet: mixed whitespace, trailing
 * punctuation, and duplicate links.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]})]+/gi;
// Punctuation that commonly trails a URL in prose but is not part of it.
const TRAILING_JUNK = /[.,;:!?)\]}'"]+$/;

/** Extracts a de-duplicated list of valid http(s) URLs from a text block. */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const cleaned = raw.replace(TRAILING_JUNK, "").trim();
    if (!cleaned) continue;
    try {
      // Normalise + validate. Throws on malformed input.
      seen.add(new URL(cleaned).toString());
    } catch {
      // Skip anything that is not a parseable URL.
    }
  }
  return [...seen];
}
