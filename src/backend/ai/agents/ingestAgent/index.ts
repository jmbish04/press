/**
 * @fileoverview IngestAgent — a Durable Object that drives URL ingestion with
 * live per-article progress broadcast to the client over the Agents SDK
 * websocket protocol. `setState` updates auto-replicate to every connected
 * `useAgent` hook so the UI re-renders without polling.
 */

import { Agent, callable } from "agents";

import type { IngestItem, IngestState } from "./types";

import { runBatch } from "./methods/runBatch";
import { INITIAL_INGEST_STATE } from "./types";

export class IngestAgent extends Agent<Env, IngestState> {
  initialState: IngestState = INITIAL_INGEST_STATE;

  /**
   * Accepts a list of URLs to process. Returns immediately after enqueueing
   * so the client can start rendering progress; the actual run continues in
   * the background via `ctx.waitUntil`.
   */
  @callable()
  async enqueue(urls: string[]): Promise<{ accepted: number; busy: boolean }> {
    if (this.state.busy) {
      return { accepted: 0, busy: true };
    }

    const unique = [...new Set((urls ?? []).map((u) => String(u).trim()).filter(Boolean))];
    if (unique.length === 0) return { accepted: 0, busy: false };

    this.setState({
      items: unique.map((url) => ({ url, status: "queued" })),
      startedAt: Date.now(),
      finishedAt: null,
      busy: true,
    });

    // Detach from the RPC call so the response returns immediately, but keep
    // the DO alive for the duration of the batch.
    this.ctx.waitUntil(this.processBatch(unique));

    return { accepted: unique.length, busy: true };
  }

  /** Wipe the queue (used after a run finishes so the UI can start fresh). */
  @callable()
  reset(): void {
    if (this.state.busy) return;
    this.setState(INITIAL_INGEST_STATE);
  }

  private async processBatch(urls: string[]): Promise<void> {
    try {
      await runBatch(this.env, urls, {
        onItem: (index, patch) => this.patchItem(index, patch),
      });
    } catch (err) {
      console.error("IngestAgent batch failed", err);
    } finally {
      this.setState({ ...this.state, busy: false, finishedAt: Date.now() });
    }
  }

  private patchItem(index: number, patch: Partial<IngestItem>): void {
    const items = this.state.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    this.setState({ ...this.state, items });
  }
}

export type { IngestItem, IngestItemStatus, IngestState } from "./types";
