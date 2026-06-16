import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { sources } from "./sources";

/** Archived articles ingested via Browser Rendering. */
export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  /** Canonical article title (from Kimi extraction or URL slug fallback). */
  title: text("title"),
  rawContent: text("raw_content"),
  /** AI-cleaned article HTML — nav/boilerplate stripped. Reader renders this with dangerouslySetInnerHTML. */
  cleanContent: text("clean_content"),
  /** Plain-text version of the article for TTS narration (no HTML tags). */
  transcriptionText: text("transcription_text"),
  /** JSON array of timestamped segments from Whisper for highlight-as-you-speak. */
  transcriptionSegments: text("transcription_segments"),
  /** R2 object key for the raw markdown text captured during ingestion. */
  markdownKey: text("markdown_key"),
  /** R2 object key (within the SPAWNED_PWAS bucket) of the page screenshot (viewport). */
  screenshotKey: text("screenshot_key"),
  /** R2 object key for the full-page screenshot captured during ingestion. */
  fullScreenshotKey: text("full_screenshot_key"),
  /** R2 object key for the pre-generated PDF captured during ingestion. */
  pdfKey: text("pdf_key"),
  /** R2 object key for TTS narration audio generated via Workers AI Deepgram Aura-2. */
  audioKey: text("audio_key"),
  /** R2 object key for the default mind map JSON built during article processing. */
  mindmapKey: text("mindmap_key"),
  /** MindElixirData JSON stored inline for instant page-load rendering (no R2 round-trip). */
  mindmapData: text("mindmap_data"),
  /** UUID for grouping chunked Vectorize embeddings. Set at ingest time. */
  ragUuid: text("rag_uuid"),
  /** FK to resolved publication source (populated during ingestion). */
  sourceId: integer("source_id").references(() => sources.id),
  /** Whether this article has been opened in the reader. */
  isRead: integer("is_read", { mode: "boolean" }).default(false).notNull(),
  /** When the article was first opened in the reader. */
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
