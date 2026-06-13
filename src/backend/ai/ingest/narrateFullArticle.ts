/**
 * @fileoverview Full-article narration via chunked TTS + WAV merge.
 *
 * Generates a single WAV file covering the ENTIRE article by:
 *   1. Stripping HTML from cleanContent to get plain prose
 *   2. Chunking by paragraph boundaries into ~4000 char batches
 *   3. Calling Deepgram Aura-2 for each chunk
 *   4. Merging WAV buffers (strip headers from chunks 2+, concatenate PCM)
 *
 * Used by the narration route, Workflow audio step, and backfill audio.
 */

import { AI_GATEWAY_OPTIONS } from "../gateway";

/** Deepgram Aura-2 TTS model on Workers AI. */
const TTS_MODEL = "@cf/deepgram/aura-2-en";

/** Target chunk size in characters. Well within Aura-2's safe zone. */
const CHUNK_TARGET = 4000;

/** Standard WAV header size in bytes. */
const WAV_HEADER_SIZE = 44;

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
 * @param voice Aura-2 voice name (e.g. "asteria", "luna", "stella")
 * @returns Single merged WAV ArrayBuffer covering the entire article
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

  // Chunk by paragraph boundaries.
  const chunks = chunkByParagraph(plainText, CHUNK_TARGET);

  // Generate audio for each chunk.
  const wavBuffers: ArrayBuffer[] = [];

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    const response = await env.AI.run(
      TTS_MODEL as never,
      { text: chunk, voice } as never,
      AI_GATEWAY_OPTIONS,
    );

    wavBuffers.push(response as unknown as ArrayBuffer);
  }

  if (wavBuffers.length === 0) {
    throw new Error("No audio chunks generated");
  }

  // Single chunk — return directly, no merge needed.
  if (wavBuffers.length === 1) {
    return wavBuffers[0];
  }

  // Merge multiple WAV buffers into one.
  return mergeWavBuffers(wavBuffers);
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

// ---------------------------------------------------------------------------
// WAV merge
// ---------------------------------------------------------------------------

/**
 * Merge multiple WAV buffers into a single WAV file.
 *
 * Assumes all WAV files share the same sample rate, bit depth, and channel
 * count (which they do since they all come from the same Aura-2 model).
 *
 * Strategy:
 * - Read the WAV header (44 bytes) from the first buffer
 * - Extract raw PCM data (bytes 44+) from each buffer
 * - Concatenate all PCM payloads
 * - Write a new WAV header with updated sizes
 */
function mergeWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  // Read header from first buffer to get audio format details.
  const firstView = new DataView(buffers[0]);

  // Collect PCM data from all buffers (skip 44-byte header from each).
  const pcmChunks: Uint8Array[] = [];
  let totalPcmLength = 0;

  for (const buf of buffers) {
    if (buf.byteLength <= WAV_HEADER_SIZE) continue;
    const pcm = new Uint8Array(buf, WAV_HEADER_SIZE);
    pcmChunks.push(pcm);
    totalPcmLength += pcm.byteLength;
  }

  // Build the merged WAV buffer: 44-byte header + all PCM data.
  const merged = new ArrayBuffer(WAV_HEADER_SIZE + totalPcmLength);
  const mergedView = new DataView(merged);
  const mergedBytes = new Uint8Array(merged);

  // Copy the original header.
  mergedBytes.set(new Uint8Array(buffers[0], 0, WAV_HEADER_SIZE));

  // Update file size: total file size - 8 bytes ("RIFF" + file size field).
  mergedView.setUint32(4, WAV_HEADER_SIZE + totalPcmLength - 8, true);

  // Update data chunk size (at byte offset 40).
  mergedView.setUint32(40, totalPcmLength, true);

  // Copy PCM data.
  let offset = WAV_HEADER_SIZE;
  for (const pcm of pcmChunks) {
    mergedBytes.set(pcm, offset);
    offset += pcm.byteLength;
  }

  return merged;
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
