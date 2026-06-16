/**
 * @fileoverview Full-article narration via chunked TTS.
 *
 * Generates a single MP3 file covering the ENTIRE article by:
 *   1. Stripping HTML from cleanContent to get plain prose
 *   2. Chunking by paragraph boundaries into ~4000 char batches
 *   3. Calling Deepgram Aura-2 (English) for each chunk with `speaker` + mp3 encoding
 *   4. Concatenating the MP3 chunks into one buffer
 *
 * Returns an MP3 ArrayBuffer. Aura-2's binding hands back a ReadableStream of
 * MPEG audio (NOT a WAV ArrayBuffer), so callers must store it as `audio/mpeg`.
 *
 * Used by the narration route, Workflow audio step, and backfill audio.
 */

import { AI_GATEWAY_OPTIONS } from "../gateway";

/** Deepgram Aura-2 (English) TTS model on Workers AI. */
const TTS_MODEL = "@cf/deepgram/aura-2-en";

/**
 * Aura-2 rejects any single request whose `text` exceeds 2000 characters
 * (API error 8007). Keep chunks comfortably under that.
 */
const MAX_TTS_CHARS = 2000;
const CHUNK_TARGET = 1800;

/**
 * Valid aura-2-en speaker names. The model takes a `speaker` parameter (the
 * old code passed `voice`, which the model ignored). Anything outside this set
 * is rejected, so we validate and fall back to a known-good default.
 */
const VALID_SPEAKERS = new Set([
  "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena",
  "atlas", "aurora", "callista", "cora", "cordelia", "delia", "draco",
  "electra", "harmonia", "helena", "hera", "hermes", "hyperion", "iris",
  "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus",
  "ophelia", "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn",
  "thalia", "theia", "vesta", "zeus",
]);
const DEFAULT_SPEAKER = "asteria";

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Generate narration audio for the full article.
 *
 * @param env Worker env bindings
 * @param content Clean article text (HTML or plain text). HTML tags are
 *   stripped to produce natural-sounding prose. Pass `cleanContent` from the
 *   Kimi extraction — never raw scraped text.
 * @param voice Aura-2 speaker name (e.g. "asteria", "luna", "orion")
 * @returns Single MP3 ArrayBuffer covering the entire article
 */
export async function narrateFullArticle(
  env: Env,
  content: string,
  voice: string,
): Promise<ArrayBuffer> {
  // Strip HTML to plain text for TTS.
  const plainText = stripHtml(content);

  if (!plainText || plainText.trim().length < 50) {
    throw new Error("Content too short for narration");
  }

  const speaker = VALID_SPEAKERS.has(voice) ? voice : DEFAULT_SPEAKER;

  // Chunk by paragraph boundaries, then hard-cap any chunk that still exceeds
  // the model's per-request character limit (e.g. one very long sentence).
  const chunks = hardCap(chunkByParagraph(plainText, CHUNK_TARGET), MAX_TTS_CHARS);

  // Generate audio for each chunk. aura-2 returns a ReadableStream of MPEG
  // (MP3) audio — NOT a WAV ArrayBuffer — so we read the bytes of each chunk
  // and concatenate the MP3 frames into one file.
  const parts: Uint8Array[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    const response = await env.AI.run(
      TTS_MODEL as never,
      { text: chunk, speaker, encoding: "mp3" } as never,
      AI_GATEWAY_OPTIONS,
    );

    const bytes = await toBytes(response);
    if (bytes.byteLength > 0) parts.push(bytes);
  }

  if (parts.length === 0) {
    throw new Error("No audio chunks generated");
  }

  return concatBytes(parts);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split text into chunks at paragraph boundaries, respecting a target size.
 * Never cuts mid-sentence — always splits on double-newline or sentence end.
 */
function chunkByParagraph(text: string, targetSize: number): string[] {
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // If adding this paragraph would exceed the target, flush current.
    if (current.length > 0 && current.length + trimmed.length + 2 > targetSize) {
      chunks.push(current.trim());
      current = "";
    }

    current += (current ? "\n\n" : "") + trimmed;
  }

  // Flush remaining.
  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Edge case: a single paragraph longer than targetSize.
  // Split it by sentence boundaries to avoid exceeding model limits.
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= targetSize) {
      result.push(chunk);
    } else {
      result.push(...chunkBySentence(chunk, targetSize));
    }
  }

  return result;
}

/**
 * Split a long block by sentence boundaries when a paragraph exceeds target.
 */
function chunkBySentence(text: string, targetSize: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length > targetSize) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Final safety net: split any chunk still longer than `max` characters into
 * `max`-sized pieces so no request can exceed the model's hard limit.
 */
function hardCap(chunks: string[], max: number): string[] {
  const out: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= max) {
      out.push(chunk);
      continue;
    }
    for (let i = 0; i < chunk.length; i += max) {
      out.push(chunk.slice(i, i + max));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audio response handling
// ---------------------------------------------------------------------------

/**
 * Normalise whatever `env.AI.run` returns for a TTS call into raw bytes.
 * The binding usually returns a ReadableStream, but depending on the runtime
 * it may also hand back a Response, an ArrayBuffer, or a `{ audio }` payload.
 */
async function toBytes(res: unknown): Promise<Uint8Array> {
  if (res instanceof Uint8Array) return res;
  if (res instanceof ArrayBuffer) return new Uint8Array(res);
  if (res instanceof ReadableStream) {
    return new Uint8Array(await new Response(res).arrayBuffer());
  }
  if (res instanceof Response) {
    return new Uint8Array(await res.arrayBuffer());
  }
  if (res && typeof res === "object" && "audio" in (res as Record<string, unknown>)) {
    const audio = (res as { audio: unknown }).audio;
    if (typeof audio === "string") return base64ToBytes(audio);
    if (audio instanceof ArrayBuffer) return new Uint8Array(audio);
  }
  // Last resort — let Response figure it out (e.g. a Blob).
  return new Uint8Array(await new Response(res as BodyInit).arrayBuffer());
}

/** Decode a base64 (or data-URI) string to bytes. */
function base64ToBytes(b64: string): Uint8Array {
  const comma = b64.indexOf(",");
  const raw = b64.startsWith("data:") && comma !== -1 ? b64.slice(comma + 1) : b64;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Concatenate audio byte chunks into one ArrayBuffer. */
function concatBytes(parts: Uint8Array[]): ArrayBuffer {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out.buffer;
}

// ---------------------------------------------------------------------------
// HTML stripping
// ---------------------------------------------------------------------------

/**
 * Strip HTML tags to produce clean prose for TTS.
 * Converts block-level tags to paragraph breaks and strips all inline markup.
 */
function stripHtml(html: string): string {
  return html
    // Convert block-level closing tags to double newlines.
    .replace(/<\/(p|div|h[1-6]|blockquote|li|tr)>/gi, "\n\n")
    // Convert <br> to newline.
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip all remaining HTML tags.
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities.
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse excessive whitespace.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
