/**
 * @fileoverview Articles browse API.
 *
 * - `GET /api/articles`     — list articles with their AI-extracted properties
 *                             and tags. Supports `?tags=1,2,3` filtering.
 * - `GET /api/articles/:id` — article detail (properties, tags, viewer URLs).
 * - `GET /api/articles/:id/pdf` — on-demand Browser Rendering PDF, cached in R2.
 */

import puppeteer from "@cloudflare/puppeteer";
import { desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { articleProperties, articleTags, articles, propertyKeys, tags } from "../../db/schemas";

export const articlesRouter = new Hono<{ Bindings: Env }>();

interface ArticleListItem {
  id: number;
  url: string;
  host: string;
  title: string;
  summary: string;
  topic?: string;
  source?: string;
  author?: string;
  screenshotUrl: string | null;
  tags: { id: number; name: string }[];
  properties: Record<string, string>;
  createdAt: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function parseIntList(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** Loads property / tag joins for a set of article IDs in two batched queries. */
async function loadMeta(env: Env, ids: number[]) {
  if (ids.length === 0) {
    return {
      properties: new Map<number, Record<string, string>>(),
      tags: new Map<number, { id: number; name: string }[]>(),
    };
  }
  const db = getDb(env);
  const propsRows = await db
    .select({
      articleId: articleProperties.articleId,
      key: propertyKeys.key,
      value: articleProperties.value,
    })
    .from(articleProperties)
    .innerJoin(propertyKeys, eq(articleProperties.propertyId, propertyKeys.id))
    .where(inArray(articleProperties.articleId, ids));

  const tagsRows = await db
    .select({
      articleId: articleTags.articleId,
      id: tags.id,
      name: tags.name,
    })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(inArray(articleTags.articleId, ids));

  const properties = new Map<number, Record<string, string>>();
  for (const row of propsRows) {
    const bag = properties.get(row.articleId) ?? {};
    bag[row.key.toLowerCase()] = row.value;
    properties.set(row.articleId, bag);
  }
  const tagsByArticle = new Map<number, { id: number; name: string }[]>();
  for (const row of tagsRows) {
    const list = tagsByArticle.get(row.articleId) ?? [];
    list.push({ id: row.id, name: row.name });
    tagsByArticle.set(row.articleId, list);
  }
  return { properties, tags: tagsByArticle };
}

function shapeArticle(
  row: { id: number; url: string; screenshotKey: string | null; createdAt: Date | null },
  properties: Record<string, string> = {},
  tagsList: { id: number; name: string }[] = [],
): ArticleListItem {
  return {
    id: row.id,
    url: row.url,
    host: hostOf(row.url),
    title: properties.title ?? properties.topic ?? hostOf(row.url),
    summary: properties.summary ?? "",
    topic: properties.topic,
    source: properties.source,
    author: properties.author,
    screenshotUrl: row.screenshotKey ? `/artifacts/${row.screenshotKey}` : null,
    tags: tagsList,
    properties,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

/** List articles. Optional `tags=1,2` (OR semantics) and `category=` filters. */
articlesRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const filterTagIds = parseIntList(c.req.query("tags"));
  const category = c.req.query("category");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "200", 10) || 200, 500);

  let rows = await db
    .select({
      id: articles.id,
      url: articles.url,
      screenshotKey: articles.screenshotKey,
      createdAt: articles.createdAt,
    })
    .from(articles)
    .orderBy(desc(articles.createdAt))
    .limit(limit);

  if (filterTagIds.length > 0) {
    const tagged = await db
      .selectDistinct({ articleId: articleTags.articleId })
      .from(articleTags)
      .where(inArray(articleTags.tagId, filterTagIds));
    const allowed = new Set(tagged.map((r) => r.articleId));
    rows = rows.filter((r) => allowed.has(r.id));
  }

  const meta = await loadMeta(
    c.env,
    rows.map((r) => r.id),
  );
  let items = rows.map((r) => shapeArticle(r, meta.properties.get(r.id), meta.tags.get(r.id)));

  if (category) {
    const needle = category.toLowerCase();
    items = items.filter((it) => (it.topic ?? "").toLowerCase() === needle);
  }

  return c.json({ articles: items });
});

/** Article detail with full content for the markdown viewer. */
articlesRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const row = await db.select().from(articles).where(eq(articles.id, id)).get();
  if (!row) return c.json({ error: "Not found" }, 404);

  const meta = await loadMeta(c.env, [id]);
  const properties = meta.properties.get(id) ?? {};
  const tagsList = meta.tags.get(id) ?? [];

  return c.json({
    ...shapeArticle(row, properties, tagsList),
    rawContent: row.rawContent ?? "",
    pdfUrl: `/api/articles/${id}/pdf`,
  });
});

/**
 * On-demand PDF view. The first request renders the page with Browser Rendering
 * and stores the PDF in R2; subsequent requests stream the cached copy.
 */
articlesRouter.get("/:id/pdf", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const row = await db.select().from(articles).where(eq(articles.id, id)).get();
  if (!row) return c.json({ error: "Not found" }, 404);

  const key = `pdf/${id}.pdf`;
  const cached = await c.env.SPAWNED_PWAS.get(key);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  const browser = await puppeteer.launch(c.env.BROWSER);
  try {
    const page = await browser.newPage();
    await page.goto(row.url, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 600));
    const pdf = (await page.pdf({ format: "A4", printBackground: true })) as Uint8Array;
    await c.env.SPAWNED_PWAS.put(key, pdf, {
      httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000" },
    });
    return new Response(pdf as unknown as BodyInit, {
      headers: { "Content-Type": "application/pdf" },
    });
  } finally {
    await browser.close();
  }
});
