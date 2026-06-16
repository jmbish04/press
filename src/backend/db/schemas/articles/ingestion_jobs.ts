/**
 * @fileoverview Ingestion pipeline job tracking table.
 *
 * Each row maps 1:1 to a Cloudflare Workflow instance. The workflow writes
 * progress here after every step so the Processing page can display real-time
 * status, and so that retry / discard actions have a stable target.
 *
 * Stage values (0–8): 0=queued, 1=fetch, 2=render, 3=extract, 4=embed, 5=index, 6=tags, 7=mindmap, 8=audio
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ingestionJobs = sqliteTable("ingestion_jobs", {
  /** Unique job ID — typically matches the Workflow instance ID. */
  id: text("id").primaryKey(),
  /** The URL being ingested. */
  url: text("url").notNull(),
  /** Source publication identifier (e.g. "verge", "ars"), if pre-detected. */
  source: text("source"),
  /**
   * Current pipeline stage (0–6).
   * 0=queued, 1=fetch, 2=render, 3=extract, 4=embed, 5=index, 6=mindmap
   */
  stage: integer("stage").default(0),
  /** Job state: active | done | err | discarded */
  state: text("state").default("active"),
  /** Extracted article title (populated after extract step). */
  title: text("title"),
  /** Error message on failure (populated when state='err'). */
  error: text("error"),
  /** The D1 article ID once the article is indexed (populated after index step). */
  articleId: integer("article_id"),
  /** Cloudflare Workflow instance ID for control (pause, resume, terminate). */
  workflowInstanceId: text("workflow_instance_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
