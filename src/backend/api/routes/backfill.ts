/**
 * @fileoverview Admin backfill API route.
 *
 * Provides guarded endpoints for idempotently filling missing data on
 * existing articles (cleanContent, source, screenshot, PDF, mind map,
 * audio, rag_uuid + chunk vectors, author/publishedDate properties).
 *
 * Protected by API-key middleware. Designed to be driven by an external
 * Python orchestrator that pages through `GET /api/articles` and POSTs
 * backfill requests for each incomplete article.
 */

import { eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { articles, preferences } from "../../db/schemas";
import { AI_GATEWAY_OPTIONS, MODELS, embed } from "../../ai/gateway";
import { cleanArticleContent } from "../../ai/ingest/cleanContent";
import { extractArticle } from "../../ai/ingest/extractArticle";
import { narrateFullArticle } from "../../ai/ingest/narrateFullArticle";
import { resolveSource } from "../../ai/ingest/resolveSource";
import { generateMindMapData } from "../../ai/agents/pwaSpawner/methods/generateMindMapData";
import { chunkText } from "../../ai/rag/chunkText";
import { apiKeyMiddleware } from "../middleware/apiKey";

export const backfillRouter = new Hono<{ Bindings: Env }>();

// All backfill routes require API key.
backfillRouter.use("*", apiKeyMiddleware);

/** GET /api/admin/backfill/status — summary of how many articles are incomplete. */
backfillRouter.get("/status", async (c) => {
  const db = getDb(c.env);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)`,
      missingClean: sql<number>`sum(case when ${articles.cleanContent} is null then 1 else 0 end)`,
      missingSource: sql<number>`sum(case when ${articles.sourceId} is null then 1 else 0 end)`,
      missingScreenshot: sql<number>`sum(case when ${articles.screenshotKey} is null then 1 else 0 end)`,
      missingPdf: sql<number>`sum(case when ${articles.pdfKey} is null then 1 else 0 end)`,
      missingMindmap: sql<number>`sum(case when ${articles.mindmapKey} is null then 1 else 0 end)`,
      missingAudio: sql<number>`sum(case when ${articles.audioKey} is null then 1 else 0 end)`,
      missingRag: sql<number>`sum(case when ${articles.ragUuid} is null then 1 else 0 end)`,
    })
    .from(articles);

  return c.json({
    total: totals?.total ?? 0,
    incomplete: {
      cleanContent: totals?.missingClean ?? 0,
      source: totals?.missingSource ?? 0,
      screenshot: totals?.missingScreenshot ?? 0,
      pdf: totals?.missingPdf ?? 0,
      mindmap: totals?.missingMindmap ?? 0,
      audio: totals?.missingAudio ?? 0,
      ragUuid: totals?.missingRag ?? 0,
    },
  });
});


/** POST /api/admin/backfill/sources — backfill sources for all articles where sourceId is null. */
backfillRouter.post("/sources", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select({ id: articles.id, url: articles.url })
    .from(articles)
    .where(isNull(articles.sourceId))
    .all();

  const results = [];
  for (const row of rows) {
    try {
      const resolved = await resolveSource(c.env, row.url);
      await db
        .update(articles)
        .set({ sourceId: resolved.id })
        .where(eq(articles.id, row.id));
      results.push({ id: row.id, url: row.url, source: resolved.name });
    } catch (err) {
      console.error(`Backfill source failed for ${row.url}:`, err);
      results.push({
        id: row.id,
        url: row.url,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return c.json({
    total: rows.length,
    processed: results,
  });
});

/** POST /api/admin/backfill/:id — backfill a single article (idempotent). */
backfillRouter.post("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env);
  const row = await db.select().from(articles).where(eq(articles.id, id)).get();
  if (!row) return c.json({ error: "Article not found" }, 404);

  const filled: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // ── Clean content ──────────────────────────────────────────────────
  if (!row.cleanContent && row.rawContent) {
    try {
      const cleaned = await cleanArticleContent(c.env, row.rawContent);
      await db.update(articles).set({ cleanContent: cleaned }).where(eq(articles.id, id));
      filled.push("cleanContent");
    } catch (err) {
      errors.push(`cleanContent: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    skipped.push("cleanContent");
  }

  // ── Source resolution ──────────────────────────────────────────────
  if (!row.sourceId) {
    try {
      const resolved = await resolveSource(c.env, row.url);
      await db.update(articles).set({ sourceId: resolved.id }).where(eq(articles.id, id));
      filled.push("source");
    } catch (err) {
      errors.push(`source: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    skipped.push("source");
  }

  // ── RAG embeddings ────────────────────────────────────────────────
  if (!row.ragUuid) {
    try {
      const ragUuid = crypto.randomUUID();
      const contentForEmbedding = row.cleanContent || row.rawContent || "";
      const chunks = chunkText(contentForEmbedding);

      for (const chunk of chunks) {
        const vector = await embed(c.env, chunk.text);
        if (vector) {
          await c.env.VECTORIZE.upsert([
            {
              id: `${id}-chunk-${chunk.index}`,
              values: vector,
              metadata: { rag_uuid: ragUuid, articleId: id, chunkIndex: chunk.index, url: row.url },
            },
          ]);
        }
      }

      await db.update(articles).set({ ragUuid }).where(eq(articles.id, id));
      filled.push(`ragUuid (${chunks.length} chunks)`);
    } catch (err) {
      errors.push(`ragUuid: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    skipped.push("ragUuid");
  }

  // ── Mind map ──────────────────────────────────────────────────────
  if (!row.mindmapKey && row.rawContent) {
    try {
      const title = row.title || row.url;
      // Prefer cleanContent (Kimi-extracted, no nav junk) for better mind maps.
      const content = row.cleanContent || row.rawContent;
      const mindMapData = await generateMindMapData(c.env, content, title);
      const mindmapJson = JSON.stringify(mindMapData);
      const mindmapKey = `mindmaps/article-${id}.json`;

      await c.env.SPAWNED_PWAS.put(mindmapKey, mindmapJson, {
        httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=86400" },
      });

      await db
        .update(articles)
        .set({ mindmapKey, mindmapData: mindmapJson })
        .where(eq(articles.id, id));

      filled.push("mindmap");
    } catch (err) {
      errors.push(`mindmap: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    skipped.push("mindmap");
  }

  // ── Audio narration ───────────────────────────────────────────────────────
  if (!row.audioKey && (row.cleanContent || row.rawContent)) {
    try {
      const content = row.cleanContent || row.rawContent!;

      // Read configured voice.
      let voice = "asteria";
      try {
        const voicePref = await db
          .select()
          .from(preferences)
          .where(eq(preferences.key, "narration_voice"))
          .get();
        if (voicePref?.value) {
          const parsed = JSON.parse(voicePref.value);
          if (typeof parsed === "string" && parsed.trim()) voice = parsed.trim();
        }
      } catch { /* fallback */ }

      const audioBytes = await narrateFullArticle(c.env, content, voice);
      const audioKey = `audio/article-${id}.wav`;

      await c.env.SPAWNED_PWAS.put(audioKey, audioBytes, {
        httpMetadata: { contentType: "audio/wav", cacheControl: "public, max-age=86400" },
      });

      await db.update(articles).set({ audioKey }).where(eq(articles.id, id));
      filled.push("audio");
    } catch (err) {
      errors.push(`audio: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    skipped.push("audio");
  }

  // Note: screenshot + PDF backfill require Browser Rendering (Puppeteer),
  // which is expensive. These are better handled by re-running the workflow
  // or via a separate batch endpoint that opens a browser session.
  if (!row.screenshotKey) skipped.push("screenshot (requires browser)");
  if (!row.pdfKey) skipped.push("pdf (requires browser)");

  return c.json({
    articleId: id,
    filled,
    skipped,
    errors,
  });
});



