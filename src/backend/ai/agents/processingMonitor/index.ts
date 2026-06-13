/**
 * @fileoverview ProcessingMonitor — a lightweight Durable Object that acts as
 * a real-time WebSocket broadcast hub for article ingestion progress.
 *
 * The `ArticleIngestionWorkflow` calls `broadcastUpdate` via RPC whenever a
 * job's stage changes. The monitor uses `this.broadcast()` to push the delta
 * to all connected Processing page clients — only the changed job is sent,
 * not the full state.
 *
 * On connect, the monitor hydrates the new client with the current job list
 * from D1 via `onConnect`.
 */

import { Agent, type Connection, type ConnectionContext, callable } from "agents";
import { desc, eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { ingestionJobs } from "@/backend/db/schemas";

export interface ProcessingJobUpdate {
  id: string;
  url: string;
  stage: number;
  state: string;
  title?: string | null;
  error?: string | null;
  articleId?: number | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** Message types sent to clients over the WebSocket. */
type ProcessingMessage =
  | { type: "snapshot"; jobs: ProcessingJobUpdate[] }
  | { type: "update"; job: ProcessingJobUpdate }
  | { type: "stats"; stats: ProcessingStats };

interface ProcessingStats {
  active: number;
  done: number;
  err: number;
  discarded: number;
  total: number;
}

const MAX_JOBS = 200;

export class ProcessingMonitor extends Agent<Env, Record<string, never>> {
  initialState = {};

  /**
   * When a new client connects, send them a snapshot of recent jobs from D1.
   */
  async onConnect(connection: Connection, _ctx: ConnectionContext) {
    try {
      const db = getDb(this.env);
      const rows = await db
        .select()
        .from(ingestionJobs)
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(MAX_JOBS);

      const jobs: ProcessingJobUpdate[] = rows.map((r) => ({
        id: r.id,
        url: r.url,
        stage: r.stage ?? 0,
        state: r.state ?? "active",
        title: r.title ?? null,
        error: r.error ?? null,
        articleId: r.articleId ?? null,
        source: r.source ?? null,
        createdAt: r.createdAt?.toISOString() ?? null,
        updatedAt: r.updatedAt?.toISOString() ?? null,
      }));

      const msg: ProcessingMessage = { type: "snapshot", jobs };
      connection.send(JSON.stringify(msg));
    } catch (err) {
      console.error("ProcessingMonitor hydrate failed:", err);
    }
  }

  /**
   * Called by the workflow (via RPC) to broadcast a single job update to all
   * connected clients. Only the changed job is sent — not the entire list.
   */
  @callable()
  broadcastUpdate(update: ProcessingJobUpdate): void {
    const msg: ProcessingMessage = { type: "update", job: update };
    this.broadcast(JSON.stringify(msg));
  }

  /**
   * Batch update — used when the submit endpoint queues many jobs at once.
   */
  @callable()
  broadcastBatch(updates: ProcessingJobUpdate[]): void {
    for (const u of updates) {
      const msg: ProcessingMessage = { type: "update", job: u };
      this.broadcast(JSON.stringify(msg));
    }
  }
}
