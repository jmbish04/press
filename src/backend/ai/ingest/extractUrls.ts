/**
 * @fileoverview Rigorous URL extraction from free-form text.
 *
 * Handles raw dumps from an iOS share sheet: mixed whitespace, trailing
 * punctuation, and duplicate links. Returns both accepted and rejected URLs
 * so callers can inform the client which links need to be resolved.
 */

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]})]+/gi;
// Punctuation that commonly trails a URL in prose but is not part of it.
const TRAILING_JUNK = /[.,;:!?)\]}'\"]+$/;

/** Domains that are aggregators / redirectors, not actual articles. */
const BLOCKED_DOMAINS = new Set([
  "news.google.com",
  "www.google.com",
  "google.com",
  "t.co",
]);

export interface ExtractResult {
  accepted: string[];
  rejected: Array<{ url: string; reason: string }>;
}

/** Extracts URLs from text, separating accepted from rejected (blocked domains). */
export function extractUrlsWithRejections(text: string): ExtractResult {
  const seen = new Set<string>();
  const accepted: string[] = [];
  const rejected: Array<{ url: string; reason: string }> = [];

  for (const raw of text.match(URL_PATTERN) ?? []) {
    const cleaned = raw.replace(TRAILING_JUNK, "").trim();
    if (!cleaned) continue;
    try {
      const parsed = new URL(cleaned);
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      if (BLOCKED_DOMAINS.has(parsed.hostname)) {
        rejected.push({
          url: normalized,
          reason: `"${parsed.hostname}" is a news aggregator, not an article source. Submit the actual article URL instead.`,
        });
      } else {
        accepted.push(normalized);
      }
    } catch {
      // Skip anything that is not a parseable URL.
    }
  }
  return { accepted, rejected };
}

/**
 * Legacy helper — returns only accepted URLs (backwards-compatible).
 * Use `extractUrlsWithRejections` when you need the rejection list.
 */
export function extractUrls(text: string): string[] {
  return extractUrlsWithRejections(text).accepted;
}
