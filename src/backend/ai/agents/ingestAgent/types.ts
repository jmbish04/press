/**
 * @fileoverview State + item types for the IngestAgent Durable Object.
 *
 * The agent persists this state in its own SQLite-backed storage and the
 * Cloudflare Agents SDK auto-broadcasts updates to connected `useAgent`
 * clients, which is how the frontend renders live progress.
 */

import type { ProcessArticleStatus } from "../../ingest/processArticle";

/** Status reported for one URL through the ingestion pipeline. */
export type IngestItemStatus = "queued" | "processing" | ProcessArticleStatus;

/** Per-URL row in the queue. */
export interface IngestItem {
  url: string;
  status: IngestItemStatus;
  articleId?: number;
  title?: string;
  /** Human-readable failure message (only set when `status === "failed"`). */
  error?: string;
  /** Reason for a `skipped` outcome (already archived, content too short, …). */
  reason?: string;
}

/** Whole-batch state synced to the client. */
export interface IngestState {
  items: IngestItem[];
  startedAt: number | null;
  finishedAt: number | null;
  busy: boolean;
}

export const INITIAL_INGEST_STATE: IngestState = {
  items: [],
  startedAt: null,
  finishedAt: null,
  busy: false,
};
