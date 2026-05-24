/**
 * @fileoverview The IngestAgent's batch loop.
 *
 * Extracted from the agent class for testability and to keep the index file
 * focused on the agent's lifecycle / RPC surface. The loop drives one Browser
 * Rendering session through every URL and reports per-article progress via
 * the supplied callbacks (which the agent wires into `setState`).
 */

import puppeteer from "@cloudflare/puppeteer";

import type { IngestItem } from "../types";

import { persistProperties, type PendingProperty } from "../../../ingest/persistProperties";
import { processArticle } from "../../../ingest/processArticle";

export interface RunBatchHooks {
  onItem: (index: number, patch: Partial<IngestItem>) => void;
}

/**
 * Iterates the URLs through `processArticle` inside a single browser session,
 * surfacing per-article status updates via `hooks.onItem`. Properties are
 * batch-persisted at the end of the run.
 */
export async function runBatch(env: Env, urls: string[], hooks: RunBatchHooks): Promise<void> {
  const pending: PendingProperty[] = [];
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (let i = 0; i < urls.length; i++) {
      hooks.onItem(i, { status: "processing" });
      const r = await processArticle(env, browser, urls[i]);
      hooks.onItem(i, {
        status: r.status,
        articleId: r.articleId || undefined,
        title: r.title,
        error: r.error,
        reason: r.reason,
      });
      if (r.data && r.status === "archived") {
        pending.push({ articleId: r.articleId, data: r.data });
      }
    }
  } finally {
    await browser.close();
  }
  await persistProperties(env, pending);
}
