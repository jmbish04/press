/**
 * @fileoverview Single-article ingestion pipeline.
 *
 * Used by both the bulk `/api/ingest` HTTP path (loop over URLs) and the
 * `IngestAgent` Durable Object (one URL at a time so progress can be
 * broadcast to the client between articles).
 */

import type { Browser } from "@cloudflare/puppeteer";

import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { articles } from "../../db/schemas";
import { AI_GATEWAY_OPTIONS, MODELS, embed } from "../gateway";

const MIN_CONTENT_LENGTH = 200;

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string", description: "Publication or website name" },
    author: { type: "string", description: "Article author, empty if unknown" },
    topic: { type: "string", description: "Primary subject category" },
    title: { type: "string", description: "Article headline" },
    summary: { type: "string", description: "2-3 sentence neutral summary" },
  },
  required: ["topic", "summary"],
} as const;

export type ProcessArticleStatus = "archived" | "skipped" | "failed";

export interface ProcessArticleResult {
  url: string;
  articleId: number;
  status: ProcessArticleStatus;
  title?: string;
  /** AI-extracted metadata (only present when status === "archived"). */
  data?: Record<string, string>;
  /** Reason on `skipped` / `failed`. */
  reason?: string;
  error?: string;
}

async function safeParse(text: string): Promise<unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Workers AI schema-enforced metadata extraction (no regex). */
async function extractMetadata(env: Env, text: string): Promise<Record<string, string>> {
  const response = await env.AI.run(
    MODELS.extract,
    {
      messages: [
        { role: "system", content: "Extract structured metadata from the article text." },
        { role: "user", content: text.slice(0, 6000) },
      ],
      response_format: { type: "json_schema", json_schema: EXTRACTION_SCHEMA },
    } as never,
    AI_GATEWAY_OPTIONS,
  );

  const raw = (response as { response?: unknown }).response;
  const parsed = typeof raw === "string" ? await safeParse(raw) : raw;
  if (!parsed || typeof parsed !== "object") return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Inserts the article row (idempotent on URL). Returns the row's ID plus whether
 * we created it on this call — `isNew=false` means the URL was already archived.
 */
async function ensureArticleRow(
  env: Env,
  url: string,
): Promise<{ articleId: number; isNew: boolean }> {
  const db = getDb(env);
  const inserted = await db
    .insert(articles)
    .values({ url })
    .onConflictDoNothing()
    .returning({ id: articles.id });
  if (inserted[0]) return { articleId: inserted[0].id, isNew: true };

  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.url, url))
    .limit(1);
  if (existing[0]) return { articleId: existing[0].id, isNew: false };
  throw new Error("Article row could not be located after insert");
}

/**
 * Full per-article pipeline: render → screenshot → extract → embed → upsert.
 * Returns a structured result instead of throwing for recoverable failures.
 *
 * Callers pass in an open puppeteer `Browser` so they can amortise launches
 * across many articles in a batch.
 */
export async function processArticle(
  env: Env,
  browser: Browser,
  url: string,
): Promise<ProcessArticleResult> {
  let articleId: number;
  try {
    const ensured = await ensureArticleRow(env, url);
    articleId = ensured.articleId;
    if (!ensured.isNew) {
      return { url, articleId, status: "skipped", reason: "Already archived." };
    }
  } catch (err) {
    return {
      url,
      articleId: 0,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // Let the page render before capturing.
    await new Promise((resolve) => setTimeout(resolve, 800));

    const textContent = (await page.evaluate(() => document.body.innerText)) ?? "";

    let screenshotKey: string | undefined;
    try {
      const buf = (await page.screenshot({ type: "jpeg", quality: 75 })) as Uint8Array;
      screenshotKey = `screenshots/${articleId}.jpg`;
      await env.SPAWNED_PWAS.put(screenshotKey, buf, {
        httpMetadata: {
          contentType: "image/jpeg",
          cacheControl: "public, max-age=31536000",
        },
      });
    } catch (err) {
      console.error(`Screenshot failed for ${url}`, err);
    }

    await page.close();

    const db = getDb(env);
    await db
      .update(articles)
      .set({
        rawContent: textContent,
        ...(screenshotKey ? { screenshotKey } : {}),
      })
      .where(eq(articles.id, articleId));

    if (textContent.trim().length < MIN_CONTENT_LENGTH) {
      return {
        url,
        articleId,
        status: "skipped",
        reason: "Rendered content too short for AI extraction.",
      };
    }

    const data = await extractMetadata(env, textContent);

    const vector = await embed(env, textContent.slice(0, 2000));
    if (vector) {
      await env.VECTORIZE.upsert([{ id: String(articleId), values: vector, metadata: { url } }]);
    }

    return {
      url,
      articleId,
      status: "archived",
      title: data.title ?? data.topic,
      data,
    };
  } catch (err) {
    return {
      url,
      articleId,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
