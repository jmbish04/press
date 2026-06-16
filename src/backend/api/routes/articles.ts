/**
 * @fileoverview Articles browse API.
 *
 * - `GET /api/articles`     — list articles with their AI-extracted properties
 *                             and tags. Supports `?tags=1,2,3` filtering.
 * - `GET /api/articles/:id` — article detail (properties, tags, viewer URLs).
 * - `GET /api/articles/:id/pdf` — on-demand Browser Rendering PDF, cached in R2.
 */

import { desc, eq, inArray, and } from "drizzle-orm";
import { Hono } from "hono";

import { renderPdf } from "../../ai/ingest/browserRest";
import { getDb } from "../../db";
import { articleImages, articleProperties, articleTags, articles, propertyKeys, sources, tags } from "../../db/schemas";

export const articlesRouter = new Hono<{ Bindings: Env }>();

interface SourceInfo {
  name: string;
  accent: string | null;
  bg: string | null;
  short: string | null;
  ink: string | null;
  face: string | null;
}

interface ArticleListItem {
  id: number;
  url: string;
  host: string;
  title: string;
  summary: string;
  topic?: string;
  sourceName?: string;
  author?: string;
  publishedDate?: string;
  screenshotUrl: string | null;
  source: SourceInfo | null;
  tags: { id: number; name: string; color: string | null }[];
  properties: Record<string, string>;
  isRead: boolean;
  createdAt: string | null;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
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

/** Loads property / tag / source joins for a set of article IDs. */
async function loadMeta(env: Env, ids: number[], sourceIds: (number | null)[] = []) {
  if (ids.length === 0) {
    return {
      properties: new Map<number, Record<string, string>>(),
      tags: new Map<number, { id: number; name: string; color: string | null }[]>(),
      sources: new Map<number, SourceInfo>(),
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
      color: tags.color,
    })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(inArray(articleTags.articleId, ids));

  // Load source data if any source IDs are present.
  const uniqueSourceIds = [...new Set(sourceIds.filter((id): id is number => id !== null && id !== undefined))];
  const sourceMap = new Map<number, SourceInfo>();
  if (uniqueSourceIds.length > 0) {
    const sourceRows = await db
      .select()
      .from(sources)
      .where(inArray(sources.id, uniqueSourceIds));
    for (const s of sourceRows) {
      sourceMap.set(s.id, { name: s.name, accent: s.accent, bg: s.bg, short: s.short, ink: s.ink, face: s.face });
    }
  }

  const properties = new Map<number, Record<string, string>>();
  for (const row of propsRows) {
    const bag = properties.get(row.articleId) ?? {};
    bag[row.key.toLowerCase()] = row.value;
    properties.set(row.articleId, bag);
  }
  const tagsByArticle = new Map<number, { id: number; name: string; color: string | null }[]>();
  for (const row of tagsRows) {
    const list = tagsByArticle.get(row.articleId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    tagsByArticle.set(row.articleId, list);
  }
  return { properties, tags: tagsByArticle, sources: sourceMap };
}

function shapeArticle(
  row: { id: number; url: string; title?: string | null; screenshotKey: string | null; sourceId: number | null; isRead: boolean; createdAt: Date | null },
  properties: Record<string, string> = {},
  tagsList: { id: number; name: string; color: string | null }[] = [],
  sourceInfo: SourceInfo | null = null,
): ArticleListItem {
  return {
    id: row.id,
    url: row.url,
    host: hostOf(row.url),
    title: row.title ?? properties.title ?? properties.topic ?? hostOf(row.url),
    summary: properties.summary ?? "",
    topic: properties.topic,
    sourceName: properties.source,
    author: properties.author,
    publishedDate: properties.publisheddate ?? properties.publishedDate ?? undefined,
    screenshotUrl: row.screenshotKey ? `/artifacts/${row.screenshotKey}` : null,
    source: sourceInfo,
    tags: tagsList,
    properties,
    isRead: row.isRead,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

/** List articles. Optional `tags=1,2` (OR semantics), `category=`, and `unreadOnly=true` filters. */
articlesRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const filterTagIds = parseIntList(c.req.query("tags"));
  const category = c.req.query("category");
  const unreadOnly = c.req.query("unreadOnly") === "true";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "200", 10) || 200, 500);

  const conditions = [];

  if (unreadOnly) {
    conditions.push(eq(articles.isRead, false));
  }

  if (filterTagIds.length > 0) {
    const tagged = await db
      .selectDistinct({ articleId: articleTags.articleId })
      .from(articleTags)
      .where(inArray(articleTags.tagId, filterTagIds));
    const allowedIds = tagged.map((r) => r.articleId);
    if (allowedIds.length > 0) {
      conditions.push(inArray(articles.id, allowedIds));
    } else {
      return c.json({ articles: [] });
    }
  }

  let query = db
    .select({
      id: articles.id,
      url: articles.url,
      title: articles.title,
      screenshotKey: articles.screenshotKey,
      sourceId: articles.sourceId,
      isRead: articles.isRead,
      createdAt: articles.createdAt,
    })
    .from(articles);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  let rows = await query
    .orderBy(desc(articles.createdAt))
    .limit(limit);

  const meta = await loadMeta(
    c.env,
    rows.map((r) => r.id),
    rows.map((r) => r.sourceId),
  );
  let items = rows.map((r) => {
    const sourceInfo = r.sourceId ? meta.sources.get(r.sourceId) ?? null : null;
    return shapeArticle(r, meta.properties.get(r.id), meta.tags.get(r.id), sourceInfo);
  });

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

  // Mark as read on first open.
  if (!row.isRead) {
    await db
      .update(articles)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(articles.id, id));
  }

  const meta = await loadMeta(c.env, [id], [row.sourceId]);
  const properties = meta.properties.get(id) ?? {};
  const tagsList = meta.tags.get(id) ?? [];
  const sourceInfo = row.sourceId ? meta.sources.get(row.sourceId) ?? null : null;

  // Load article images.
  const images = await db
    .select({
      id: articleImages.id,
      imageName: articleImages.imageName,
      imageCfUrl: articleImages.imageCfUrl,
      position: articleImages.position,
      caption: articleImages.caption,
    })
    .from(articleImages)
    .where(eq(articleImages.articleId, id))
    .all();

  return c.json({
    ...shapeArticle(row, properties, tagsList, sourceInfo),
    rawContent: row.rawContent ?? "",
    cleanContent: row.cleanContent ?? null,
    transcriptionText: row.transcriptionText ?? null,
    transcriptionSegments: row.transcriptionSegments ? JSON.parse(row.transcriptionSegments) : null,
    pdfUrl: `/api/articles/${id}/pdf`,
    audioUrl: row.audioKey ? `/api/articles/${id}/audio` : null,
    markdownUrl: row.markdownKey ? `/api/articles/${id}/markdown` : null,
    fullScreenshotUrl: row.fullScreenshotKey ? `/artifacts/${row.fullScreenshotKey}` : null,
    mindmapUrl: row.mindmapKey ? `/api/articles/${id}/mindmap` : null,
    mindmapData: row.mindmapData ?? null,
    images,
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

  const row = await db
    .select({ url: articles.url, pdfKey: articles.pdfKey })
    .from(articles)
    .where(eq(articles.id, id))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);

  // Fast path: pre-generated PDF from the ingestion workflow.
  const pregenKey = row.pdfKey ?? `pdf/${id}.pdf`;
  const cached = await c.env.SPAWNED_PWAS.get(pregenKey);
  if (cached) {
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/pdf",
        // `inline` so the PDF renders inside the viewer <iframe> instead of
        // triggering a download (some browsers download application/pdf by
        // default without this).
        "Content-Disposition": `inline; filename="article-${id}.pdf"`,
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  // Fallback: on-demand rendering via the Browser Rendering REST API.
  const pdf = await renderPdf(c.env, row.url);
  const key = `pdf/${id}.pdf`;
  await c.env.SPAWNED_PWAS.put(key, pdf, {
    httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000" },
  });
  // Persist the key so future requests skip rendering.
  await db.update(articles).set({ pdfKey: key }).where(eq(articles.id, id));
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="article-${id}.pdf"`,
      "Cache-Control": "public, max-age=31536000",
    },
  });
});

/**
 * Stream TTS audio from R2.
 * Generated during article processing (Step 8 of the workflow).
 */
articlesRouter.get("/:id/audio", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const row = await db
    .select({ audioKey: articles.audioKey })
    .from(articles)
    .where(eq(articles.id, id))
    .get();

  if (!row?.audioKey) return c.json({ error: "Audio not yet generated" }, 404);

  const obj = await c.env.SPAWNED_PWAS.get(row.audioKey);
  if (!obj) return c.json({ error: "Audio file not found in R2" }, 404);

  // Derive the content type from what was stored (mp3 → audio/mpeg) so old and
  // new audio both stream correctly.
  const audioType =
    obj.httpMetadata?.contentType ??
    (row.audioKey.endsWith(".mp3") ? "audio/mpeg" : "audio/wav");

  return new Response(obj.body, {
    headers: {
      "Content-Type": audioType,
      "Cache-Control": "public, max-age=86400",
    },
  });
});

/**
 * Stream the default mind map JSON from R2.
 * The mind map is generated during article processing (Step 6 of the workflow).
 */
articlesRouter.get("/:id/mindmap", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const row = await db
    .select({ mindmapKey: articles.mindmapKey, mindmapData: articles.mindmapData })
    .from(articles)
    .where(eq(articles.id, id))
    .get();

  // Fast path: D1 inline JSON (no R2 round-trip).
  if (row?.mindmapData) {
    return new Response(row.mindmapData, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  // Fallback: R2 fetch (for articles processed before the inline column was added).
  if (!row?.mindmapKey) return c.json({ error: "Mind map not yet generated" }, 404);

  const obj = await c.env.SPAWNED_PWAS.get(row.mindmapKey);
  if (!obj) return c.json({ error: "Mind map not found in R2" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

/** Stream raw markdown text from R2 for the Markdown tab. */
articlesRouter.get("/:id/markdown", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const row = await db
    .select({ markdownKey: articles.markdownKey, rawContent: articles.rawContent })
    .from(articles)
    .where(eq(articles.id, id))
    .get();

  if (!row) return c.json({ error: "Not found" }, 404);

  // Fast path: stream from R2.
  if (row.markdownKey) {
    const obj = await c.env.SPAWNED_PWAS.get(row.markdownKey);
    if (obj) {
      return new Response(obj.body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=86400",
        },
      });
    }
  }

  // Fallback: return rawContent from D1 as markdown.
  return new Response(row.rawContent ?? "No markdown content available.", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

