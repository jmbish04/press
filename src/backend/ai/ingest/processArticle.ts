/**
 * @fileoverview Single-article ingestion pipeline (ephemeral path).
 *
 * Used by both the bulk `/api/ingest` HTTP path (loop over URLs) and the
 * `IngestAgent` Durable Object (one URL at a time so progress can be
 * broadcast to the client between articles).
 *
 * This module is now at feature-parity with `ArticleIngestionWorkflow`:
 *   render → screenshot → PDF → image scrape → extract (Kimi K2.6) →
 *   images (CF Images upload) → embed (chunked) → upsert → properties →
 *   source → tags → mindmap → audio (chunked TTS)
 *
 * The Workflow is the preferred canonical path for new ingestion. This module
 * remains for compatibility with the IngestAgent and bulk imports.
 */

import type { Browser } from "@cloudflare/puppeteer";

import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { articles, articleImages, preferences } from "../../db/schemas";
import { embed } from "../gateway";
import { persistProperties, type PendingProperty } from "./persistProperties";
import { assignArticleTags } from "./assignTags";
import { resolveSource } from "./resolveSource";
import { extractArticle } from "./extractArticle";
import { narrateFullArticle } from "./narrateFullArticle";
import { uploadImageToCF, filterJunkImages, type ScrapedImage } from "./uploadImage";
import { generateMindMapData } from "../agents/pwaSpawner/methods/generateMindMapData";
import { chunkText } from "../rag/chunkText";
import { AI_GATEWAY_OPTIONS } from "../gateway";

const MIN_CONTENT_LENGTH = 200;

// Extraction schema is now in extractArticle.ts (Kimi K2.6 structured output).

/** Whisper model for generating transcription segments from TTS audio. */
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

/**
 * Extract a human-readable title from a URL slug.
 * e.g. "heres-how-apple-watch-series-11-stacks-up" → "Heres How Apple Watch Series 11 Stacks Up"
 */
function titleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    // Find the last meaningful path segment (skip trailing slash).
    const segments = pathname.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] ?? "";
    if (!slug || slug.length < 3) return "";
    // Convert slug to title case.
    return slug
      .replace(/\.[^.]+$/, "") // strip file extension
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

/**
 * Strip all HTML tags to produce clean plain text for TTS narration.
 * The resulting text contains no markup — Aura won't read "<strong>" aloud.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|blockquote|li|tr)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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



/** Read the configured narration voice from preferences, fallback to "asteria". */
async function getConfiguredVoice(env: Env): Promise<string> {
  try {
    const db = getDb(env);
    const row = await db
      .select()
      .from(preferences)
      .where(eq(preferences.key, "narration_voice"))
      .get();
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    }
  } catch {
    // Fallback silently.
  }
  return "asteria";
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
 * Full per-article pipeline — at parity with ArticleIngestionWorkflow:
 *   render → screenshot → PDF → extract → clean → embed (chunked) →
 *   upsert → properties → source → tags → mindmap → audio
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

    // ── Screenshot (viewport — for Newsstand cards) ───────────────────
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

    // ── Full-page screenshot (for the article viewport Screenshot tab) ──
    let fullScreenshotKey: string | undefined;
    try {
      const fullBuf = (await page.screenshot({
        type: "jpeg",
        quality: 80,
        fullPage: true,
      })) as Uint8Array;
      fullScreenshotKey = `screenshots/${articleId}-full.jpg`;
      await env.SPAWNED_PWAS.put(fullScreenshotKey, fullBuf, {
        httpMetadata: {
          contentType: "image/jpeg",
          cacheControl: "public, max-age=31536000",
        },
      });
    } catch (err) {
      console.error(`Full-page screenshot failed for ${url}`, err);
    }

    // ── PDF ───────────────────────────────────────────────────────────
    let pdfKey: string | undefined;
    try {
      const pdfBuf = (await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
      })) as Uint8Array;
      pdfKey = `pdf/${articleId}.pdf`;
      await env.SPAWNED_PWAS.put(pdfKey, pdfBuf, {
        httpMetadata: {
          contentType: "application/pdf",
          cacheControl: "public, max-age=31536000",
        },
      });
    } catch (err) {
      console.error(`PDF generation failed for ${url}`, err);
    }

    // ── Source resolution ─────────────────────────────────────────────
    let sourceId: number | null = null;
    try {
      const resolved = await resolveSource(env, url, page);
      sourceId = resolved.id;
    } catch (err) {
      console.error(`Source resolution failed for ${url}`, err);
    }

    // ── Image scraping ─────────────────────────────────────────────────
    let pageImages: ScrapedImage[] = [];
    try {
      const scraped = await page.evaluate(() => {
        const CHROME_SEL =
          "header, footer, nav, aside, [role=banner], [role=navigation], [role=contentinfo]";
        const ARTICLE_SEL =
          "article, main, [role=main], .article-body, .article__body, .post-content, .entry-content, .c-entry-content, [itemprop=articleBody]";
        const captionFor = (img: HTMLImageElement): string => {
          const fig = img.closest("figure");
          const cap = fig?.querySelector("figcaption");
          return cap?.textContent?.trim() ?? "";
        };
        return Array.from(document.querySelectorAll("img")).map((img) => ({
          src: img.currentSrc || img.src,
          alt: img.alt || "",
          caption: captionFor(img),
          width: img.width,
          height: img.height,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          inArticle: !!img.closest(ARTICLE_SEL),
          inChrome: !!img.closest(CHROME_SEL),
        }));
      });
      pageImages = filterJunkImages(scraped as ScrapedImage[]);
    } catch (err) {
      console.error(`Image scraping failed for ${url}`, err);
    }

    await page.close();

    // ── Raw markdown upload to R2 ──────────────────────────────────────
    let markdownKey: string | undefined;
    try {
      markdownKey = `markdown/${articleId}.md`;
      await env.SPAWNED_PWAS.put(markdownKey, textContent, {
        httpMetadata: {
          contentType: "text/markdown; charset=utf-8",
          cacheControl: "public, max-age=31536000",
        },
      });
    } catch (err) {
      console.error(`Markdown upload failed for ${url}`, err);
    }

    // ── Short-circuit if content is too short ─────────────────────────
    if (textContent.trim().length < MIN_CONTENT_LENGTH) {
      const db = getDb(env);
      await db
        .update(articles)
        .set({
          rawContent: textContent,
          ...(screenshotKey ? { screenshotKey } : {}),
          ...(fullScreenshotKey ? { fullScreenshotKey } : {}),
          ...(markdownKey ? { markdownKey } : {}),
          ...(pdfKey ? { pdfKey } : {}),
          ...(sourceId ? { sourceId } : {}),
        })
        .where(eq(articles.id, articleId));
      return {
        url,
        articleId,
        status: "skipped",
        reason: "Rendered content too short for AI extraction.",
      };
    }

    // ── Extract (Kimi K2.6 structured) ───────────────────────────────
    const extraction = await extractArticle(env, textContent);

    // Resolve canonical title: Kimi extraction > URL slug > hostname.
    const canonicalTitle =
      extraction.articleTitle?.trim() ||
      titleFromUrl(url) ||
      new URL(url).hostname.replace(/^www\./, "");

    // Build properties map from extraction.
    const data: Record<string, string> = {};
    if (canonicalTitle) data.title = canonicalTitle;
    if (extraction.summary) data.summary = extraction.summary;
    if (extraction.topic) data.topic = extraction.topic;
    if (extraction.source) data.source = extraction.source;
    if (extraction.author) data.author = extraction.author;
    if (extraction.datePublished) data.publishedDate = extraction.datePublished;

    // Build plain-text transcription text for TTS (no HTML tags).
    const transcriptionText = extraction.articleContent
      ? htmlToPlainText(extraction.articleContent)
      : textContent;

    // ── Upload images to Cloudflare Images ────────────────────────────
    const db = getDb(env);
    try {
      const placements = extraction.imagePlacements || [];
      const scrapedSrcSet = new Set(pageImages.map((img) => img.src));

      for (const placement of placements.slice(0, 10)) {
        if (!placement.originalSrc) continue;
        if (!scrapedSrcSet.has(placement.originalSrc) && !placement.originalSrc.startsWith("http")) continue;

        const result = await uploadImageToCF(env, placement.originalSrc, {
          articleId,
          imageName: placement.altText || "Article image",
        });

        if (result) {
          await db.insert(articleImages).values({
            articleId,
            imageName: placement.altText || "Article image",
            imageCfUrl: result.url,
            position: placement.position ?? 0,
            caption: placement.caption || null,
          });
        }
      }
    } catch (err) {
      console.error(`Image upload failed for ${url}`, err);
    }

    // ── Chunked RAG embeddings ───────────────────────────────────────
    const ragUuid = crypto.randomUUID();
    const contentForEmbedding = extraction.articleContent || textContent;
    const chunks = chunkText(contentForEmbedding);

    for (const chunk of chunks) {
      const vector = await embed(env, chunk.text);
      if (vector) {
        await env.VECTORIZE.upsert([
          {
            id: `${articleId}-chunk-${chunk.index}`,
            values: vector,
            metadata: { rag_uuid: ragUuid, articleId, chunkIndex: chunk.index, url },
          },
        ]);
      }
    }

    // ── Persist to D1 ────────────────────────────────────────────────
    await db
      .update(articles)
      .set({
        title: canonicalTitle,
        rawContent: textContent,
        cleanContent: extraction.articleContent || null,
        transcriptionText: transcriptionText || null,
        ragUuid,
        ...(screenshotKey ? { screenshotKey } : {}),
        ...(fullScreenshotKey ? { fullScreenshotKey } : {}),
        ...(markdownKey ? { markdownKey } : {}),
        ...(pdfKey ? { pdfKey } : {}),
        ...(sourceId ? { sourceId } : {}),
      })
      .where(eq(articles.id, articleId));

    // ── Persist properties ───────────────────────────────────────────
    if (Object.keys(data).length > 0) {
      const pending: PendingProperty[] = [{ articleId, data }];
      await persistProperties(env, pending);
    }

    // ── Tag assignment ───────────────────────────────────────────────
    try {
      const title = data.title ?? data.topic ?? url;
      await assignArticleTags(env, articleId, textContent, title);
    } catch (err) {
      console.error(`Tag assignment failed for ${url}`, err);
    }

    // ── Mind map ─────────────────────────────────────────────────────
    try {
      const title = data.title ?? data.topic ?? url;
      const mindMapData = await generateMindMapData(env, textContent, title);
      const mindmapJson = JSON.stringify(mindMapData);
      const mindmapKey = `mindmaps/article-${articleId}.json`;

      await env.SPAWNED_PWAS.put(mindmapKey, mindmapJson, {
        httpMetadata: { contentType: "application/json", cacheControl: "public, max-age=86400" },
      });

      await db
        .update(articles)
        .set({ mindmapKey, mindmapData: mindmapJson })
        .where(eq(articles.id, articleId));
    } catch (err) {
      console.error(`Mind map generation failed for ${url}`, err);
    }

    // ── Audio narration (full article, chunked TTS) ──────────────────
    try {
      // Send plain text to TTS — never HTML (Aura reads tags aloud).
      const textForNarration = transcriptionText || textContent;
      const voice = await getConfiguredVoice(env);
      const audioBytes = await narrateFullArticle(env, textForNarration, voice);
      const audioKey = `audio/article-${articleId}.wav`;

      await env.SPAWNED_PWAS.put(audioKey, audioBytes, {
        httpMetadata: { contentType: "audio/wav", cacheControl: "public, max-age=86400" },
      });

      await db
        .update(articles)
        .set({ audioKey })
        .where(eq(articles.id, articleId));

      // ── Whisper transcription (word-level timestamps for highlight-as-you-speak) ──
      try {
        const whisperResult = await env.AI.run(
          WHISPER_MODEL as never,
          { audio: [...new Uint8Array(audioBytes)] } as never,
          AI_GATEWAY_OPTIONS,
        );

        const words = (whisperResult as { words?: { word: string; start: number; end: number }[] }).words;
        if (words && words.length > 0) {
          // Convert Whisper word-level timestamps to transcription segments.
          // Group words into ~5-word segments for better highlight granularity.
          const segments: { text: string; startSecond: number; endSecond: number }[] = [];
          const WORDS_PER_SEGMENT = 5;
          for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
            const group = words.slice(i, i + WORDS_PER_SEGMENT);
            segments.push({
              text: group.map((w) => w.word).join(" "),
              startSecond: group[0].start,
              endSecond: group[group.length - 1].end,
            });
          }
          await db
            .update(articles)
            .set({ transcriptionSegments: JSON.stringify(segments) })
            .where(eq(articles.id, articleId));
        }
      } catch (whisperErr) {
        console.error(`Whisper transcription failed for ${url}`, whisperErr);
      }
    } catch (err) {
      console.error(`Audio generation failed for ${url}`, err);
    }

    return {
      url,
      articleId,
      status: "archived",
      title: canonicalTitle,
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
