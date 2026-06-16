/**
 * @fileoverview Text chunking for RAG embeddings.
 *
 * Splits article content into overlapping chunks suitable for embedding.
 * Uses sentence-boundary-aware splitting to avoid cutting mid-sentence.
 */

/** A single text chunk with its index for metadata. */
export interface TextChunk {
  index: number;
  text: string;
}

/**
 * Split text into chunks of approximately `maxTokens` tokens (estimated at
 * ~4 chars per token) with `overlapTokens` tokens of overlap.
 *
 * Splitting prefers paragraph boundaries (`\n\n`), then sentence boundaries
 * (`. `), to keep chunks coherent.
 *
 * @param text - The full article text to chunk
 * @param maxTokens - Target chunk size in tokens (default 800)
 * @param overlapTokens - Overlap between consecutive chunks (default 100)
 * @returns Array of text chunks with their indices
 */
export function chunkText(
  text: string,
  maxTokens = 800,
  overlapTokens = 100,
): TextChunk[] {
  if (!text || text.trim().length === 0) return [];

  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  // If the text fits in a single chunk, return it as-is.
  if (text.length <= maxChars) {
    return [{ index: 0, text: text.trim() }];
  }

  // Split into paragraphs first.
  const paragraphs = text.split(/\n\n+/);

  const chunks: TextChunk[] = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // If adding this paragraph would exceed the limit, flush the current chunk.
    if (currentChunk.length + trimmed.length + 2 > maxChars && currentChunk.length > 0) {
      chunks.push({ index: chunkIndex++, text: currentChunk.trim() });

      // Start new chunk with overlap from the end of the previous chunk.
      if (overlapChars > 0 && currentChunk.length > overlapChars) {
        // Find a sentence boundary near the overlap point.
        const overlapStart = currentChunk.length - overlapChars;
        const sentenceBoundary = currentChunk.indexOf(". ", overlapStart);
        if (sentenceBoundary !== -1 && sentenceBoundary < currentChunk.length) {
          currentChunk = currentChunk.slice(sentenceBoundary + 2);
        } else {
          currentChunk = currentChunk.slice(overlapStart);
        }
      } else {
        currentChunk = "";
      }
    }

    // If a single paragraph exceeds the limit, split it by sentences.
    if (trimmed.length > maxChars) {
      const sentences = trimmed.split(/(?<=\.)\s+/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length + 1 > maxChars && currentChunk.length > 0) {
          chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
          // Overlap from sentence boundary.
          if (overlapChars > 0 && currentChunk.length > overlapChars) {
            const start = currentChunk.length - overlapChars;
            const boundary = currentChunk.indexOf(". ", start);
            currentChunk = boundary !== -1 ? currentChunk.slice(boundary + 2) : currentChunk.slice(start);
          } else {
            currentChunk = "";
          }
        }
        currentChunk += (currentChunk ? " " : "") + sentence;
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  // Flush remaining content.
  if (currentChunk.trim().length > 0) {
    chunks.push({ index: chunkIndex, text: currentChunk.trim() });
  }

  return chunks;
}
