/**
 * @fileoverview Bulk article ingestion (HTTP entry point for `/api/ingest`).
 *
 * Orchestrates the shared single-article pipeline (`processArticle`) inside one
 * Browser Rendering session, then batch-writes the AI-extracted properties.
 * The `IngestAgent` Durable Object reuses the same building blocks for the
 * websocket-streamed UI flow.
 */

import puppeteer from "@cloudflare/puppeteer";

import { persistProperties, type PendingProperty } from "./persistProperties";
import { processArticle, type ProcessArticleStatus } from "./processArticle";

export interface IngestResult {
  url: string;
  status: ProcessArticleStatus;
  articleId?: number;
  title?: string;
  error?: string;
}

export async function ingestUrls(env: Env, urls: string[]): Promise<IngestResult[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const results: IngestResult[] = [];
  const pending: PendingProperty[] = [];

  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const url of unique) {
      const r = await processArticle(env, browser, url);
      results.push({
        url: r.url,
        status: r.status,
        articleId: r.articleId || undefined,
        title: r.title,
        error: r.error,
      });
      if (r.data && r.status === "archived") {
        pending.push({ articleId: r.articleId, data: r.data });
      }
    }
  } finally {
    await browser.close();
  }

  await persistProperties(env, pending);
  return results;
}
