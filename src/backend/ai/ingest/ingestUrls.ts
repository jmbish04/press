/**
 * @fileoverview Article ingestion pipeline.
 *
 * Renders each URL with Browser Rendering, extracts structured metadata with a
 * schema-enforced Workers AI call (routed through AI Gateway), embeds the text
 * into Vectorize, and persists everything to D1. Database writes for the
 * extracted properties are batched to avoid the per-property N+1 pattern.
 */

import puppeteer from "@cloudflare/puppeteer";
import { inArray } from "drizzle-orm";

import { getDb } from "../../db";
import { articleProperties, articles, propertyKeys } from "../../db/schemas";
import { AI_GATEWAY_OPTIONS, MODELS, embed } from "../gateway";

/** Outcome of ingesting a single URL. */
export interface IngestResult {
  url: string;
  status: "archived" | "skipped" | "failed";
  articleId?: number;
  title?: string;
  error?: string;
}

/** JSON Schema enforced natively by Workers AI JSON mode — no regex parsing. */
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

/** Skip AI extraction below this length — empty pages produce hallucinations. */
const MIN_CONTENT_LENGTH = 200;

/**
 * D1 multi-row inserts are chunked so a single statement stays well within the
 * bound-parameter limit. 50 rows keeps payload size and parameter count small.
 */
const D1_INSERT_CHUNK = 50;

/** Runs a schema-enforced extraction and returns a plain object. */
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
  const parsed = typeof raw === "string" ? safeParse(raw) : raw;
  if (!parsed || typeof parsed !== "object") return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      out[key] = String(value);
    }
  }
  return out;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Ingests a list of URLs. Already-archived URLs are skipped. Property-key
 * lookups and inserts are batched across the whole run.
 */
export async function ingestUrls(env: Env, urls: string[]): Promise<IngestResult[]> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const db = getDb(env);
  const results: IngestResult[] = [];

  // Pass 0 — batch-insert article rows; conflicts (already archived) drop out.
  const newArticles: { id: number; url: string }[] = [];
  for (let i = 0; i < unique.length; i += D1_INSERT_CHUNK) {
    const chunk = unique.slice(i, i + D1_INSERT_CHUNK);
    const inserted = await db
      .insert(articles)
      .values(chunk.map((url) => ({ url })))
      .onConflictDoNothing()
      .returning({ id: articles.id, url: articles.url });
    newArticles.push(...inserted);
  }

  const insertedUrls = new Set(newArticles.map((a) => a.url));
  for (const url of unique) {
    if (!insertedUrls.has(url)) results.push({ url, status: "skipped" });
  }
  if (newArticles.length === 0) return results;

  // Pass 1 — render, extract, and embed each new article.
  const pendingProperties: { articleId: number; data: Record<string, string> }[] = [];
  const browser = await puppeteer.launch(env.BROWSER);
  try {
    for (const article of newArticles) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.goto(article.url, { waitUntil: "domcontentloaded" });
        // Let the page settle so screenshots and content extraction are stable.
        await new Promise((resolve) => setTimeout(resolve, 800));

        const textContent = (await page.evaluate(() => document.body.innerText)) ?? "";

        // Screenshot best-effort — never fail the article on screenshot errors.
        let screenshotKey: string | undefined;
        try {
          const buf = (await page.screenshot({ type: "jpeg", quality: 75 })) as Uint8Array;
          screenshotKey = `screenshots/${article.id}.jpg`;
          await env.SPAWNED_PWAS.put(screenshotKey, buf, {
            httpMetadata: {
              contentType: "image/jpeg",
              cacheControl: "public, max-age=31536000",
            },
          });
        } catch (err) {
          console.error(`Screenshot failed for ${article.url}`, err);
        }

        await page.close();

        await db
          .update(articles)
          .set({
            rawContent: textContent,
            ...(screenshotKey ? { screenshotKey } : {}),
          })
          .where(inArray(articles.id, [article.id]));

        if (textContent.trim().length < MIN_CONTENT_LENGTH) {
          results.push({ url: article.url, articleId: article.id, status: "skipped" });
          continue;
        }

        const data = await extractMetadata(env, textContent);
        pendingProperties.push({ articleId: article.id, data });

        const vector = await embed(env, textContent.slice(0, 2000));
        if (vector) {
          await env.VECTORIZE.upsert([
            {
              id: String(article.id),
              values: vector,
              metadata: { url: article.url },
            },
          ]);
        }

        results.push({
          url: article.url,
          articleId: article.id,
          status: "archived",
          title: data.title ?? data.topic,
        });
      } catch (err) {
        results.push({
          url: article.url,
          articleId: article.id,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await browser.close();
  }

  // Pass 2 — resolve property keys and write properties in batches.
  await persistProperties(env, pendingProperties);

  return results;
}

/** Batches property-key resolution and article-property inserts. */
async function persistProperties(
  env: Env,
  pending: { articleId: number; data: Record<string, string> }[],
): Promise<void> {
  const keyNames = [...new Set(pending.flatMap((p) => Object.keys(p.data)))];
  if (keyNames.length === 0) return;

  const db = getDb(env);

  // One lookup for every key used across the whole run.
  const existing = await db.select().from(propertyKeys).where(inArray(propertyKeys.key, keyNames));

  const keyToId = new Map(existing.map((k) => [k.key, k.id]));
  const missing = keyNames.filter((k) => !keyToId.has(k));

  // One batched insert for any new keys.
  for (let i = 0; i < missing.length; i += D1_INSERT_CHUNK) {
    const chunk = missing.slice(i, i + D1_INSERT_CHUNK);
    const inserted = await db
      .insert(propertyKeys)
      .values(chunk.map((key) => ({ key })))
      .returning({ id: propertyKeys.id, key: propertyKeys.key });
    for (const row of inserted) keyToId.set(row.key, row.id);
  }

  const rows = pending.flatMap((p) =>
    Object.entries(p.data)
      .map(([key, value]) => {
        const propertyId = keyToId.get(key);
        return propertyId ? { articleId: p.articleId, propertyId, value: String(value) } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );

  // Chunked inserts keep each statement within D1's parameter limit.
  for (let i = 0; i < rows.length; i += D1_INSERT_CHUNK) {
    await db.insert(articleProperties).values(rows.slice(i, i + D1_INSERT_CHUNK));
  }
}
