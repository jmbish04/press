/**
 * @fileoverview Cloudflare Workflow for durable article ingestion.
 *
 * Replaces the inline `waitUntil` + `processArticle()` pipeline with a 10-step
 * durable workflow that survives crashes, retries failed steps with exponential
 * backoff, and writes per-step progress to the `ingestion_jobs` D1 table so
 * the Processing frontend page can display real-time status.
 *
 * Steps:
 *   1. fetch    — HTTP fetch + record status
 *   2. render   — Browser Rendering (viewport + full-page screenshot + DOM text + PDF + source resolve + caption-aware image scrape)
 *   3. extract  — Kimi K2.6 structured extraction (title, summary, author, publishedDate, clean HTML, imagePlacements)
 *   4. images   — Upload meaningful images to Cloudflare Images + insert article_images rows
 *   5. embed    — Vectorize embedding (chunked clean text → multiple vector upserts)
 *   6. index    — D1 insert (article row + properties + cleanContent + sourceId + ragUuid)
 *   7. tags     — AI-driven tag assignment + new tag creation
 *   8. mindmap  — Workers AI mind map generation → R2 + D1 storage
 *   9. audio    — Deepgram Aura-2 TTS narration (chunked, full article, MP3) → R2 + D1 storage
 *  10. finalize — Mark job done
 *
 * @see https://developers.cloudflare.com/workflows/
 */

import type { WorkflowEvent } from "cloudflare:workers";

import { getAgentByName } from "agents";
import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { eq } from "drizzle-orm";

import type { ProcessingMonitor } from "../ai/agents/processingMonitor";

import { generateMindMapData } from "../ai/agents/pwaSpawner/methods/generateMindMapData";
import { AI_GATEWAY_OPTIONS, MODELS, embed } from "../ai/gateway";
import { assignArticleTags } from "../ai/ingest/assignTags";
import {
  renderContent,
  renderScreenshot,
  renderPdf,
  htmlToText,
  extractImagesFromHtml,
  type ExtractedImage,
} from "../ai/ingest/browserRest";
import { detectBotBlock } from "../ai/ingest/detectBotBlock";
import { extractArticle } from "../ai/ingest/extractArticle";
import { narrateFullArticle } from "../ai/ingest/narrateFullArticle";
import { persistProperties, type PendingProperty } from "../ai/ingest/persistProperties";
import { resolveSource } from "../ai/ingest/resolveSource";
import { uploadImageToCF } from "../ai/ingest/uploadImage";
import { chunkText } from "../ai/rag/chunkText";
import { getDb } from "../db";
import { articles, articleImages, blockedUrls, ingestionJobs, preferences, sources } from "../db/schemas";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters passed when creating a workflow instance. */
export interface IngestionParams {
  /** Unique job ID — also used as the workflow instance ID. */
  jobId: string;
  /** The article URL to ingest. */
  url: string;
  /** Optional source publication hint (e.g. "verge"). */
  source?: string;
}

// Extraction schema is now in extractArticle.ts (Kimi K2.6 structured output).

const MIN_CONTENT_LENGTH = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Update the `ingestion_jobs` row with the current step progress. */
async function updateJobProgress(
  env: Env,
  jobId: string,
  updates: Partial<{
    stage: number;
    state: string;
    title: string;
    error: string;
    articleId: number;
    workflowInstanceId: string;
  }>,
): Promise<void> {
  const db = getDb(env);
  await db
    .update(ingestionJobs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(ingestionJobs.id, jobId));

  // Broadcast to ProcessingMonitor for real-time WebSocket push.
  try {
    // Read the full row to get the URL and current state for broadcast context.
    const row = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, jobId)).get();

    if (row) {
      // Native Agents SDK RPC — typed stub, no hand-built request, no `as any`.
      const monitor = await getAgentByName<Env, ProcessingMonitor>(
        env.PROCESSING_MONITOR,
        "global",
      );
      await monitor.broadcastUpdate({
        id: jobId,
        url: row.url,
        stage: row.stage ?? 0,
        state: row.state ?? "active",
        title: row.title ?? null,
        error: row.error ?? null,
        articleId: row.articleId ?? null,
        source: row.source ?? null,
        createdAt: row.createdAt?.toISOString() ?? null,
        updatedAt: row.updatedAt?.toISOString() ?? null,
      });
    }
  } catch (err) {
    // Non-critical — don't break the workflow if the monitor is down.
    console.error("ProcessingMonitor broadcast failed:", err);
  }
}

/** Parse AI response JSON safely. */
async function safeParse(text: string): Promise<unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Durable article ingestion workflow.
 *
 * Each step is independently retriable. On success the step writes progress
 * to D1 via `updateJobProgress()`. On terminal failure a `NonRetryableError`
 * marks the job as `err`.
 */
export class ArticleIngestionWorkflow extends WorkflowEntrypoint<Env, IngestionParams> {
  async run(event: WorkflowEvent<IngestionParams>, step: WorkflowStep) {
    const { jobId, url, source } = event.payload;

    try {
      // Record the workflow instance ID for management (pause/resume/terminate).
      await step.do("init", async () => {
        await updateJobProgress(this.env, jobId, {
          workflowInstanceId: event.instanceId,
          stage: 0,
          state: "active",
        });
      });

      // ── Step 1: Fetch ──────────────────────────────────────────────────
      const fetchResult = await step.do(
        "fetch",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
          timeout: "60 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 1 });

          const resp = await fetch(url, {
            headers: { "User-Agent": "Press-Archiver/1.0" },
            redirect: "follow",
          });

          if (!resp.ok) {
            if (resp.status === 404) {
              throw new NonRetryableError(`HTTP_${resp.status} — origin returned Not Found`);
            }
            throw new Error(`HTTP_${resp.status} — ${resp.statusText}`);
          }

          return { status: resp.status, contentType: resp.headers.get("content-type") || "" };
        },
      );

      // ── Step 2: Render ─────────────────────────────────────────────────
      const renderResult = await step.do(
        "render",
        {
          retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
          timeout: "120 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 2 });

          // Render via the Browser Rendering REST API. The env.BROWSER binding's
          // puppeteer.launch() hangs inside Workflows (the launch never acquires
          // a session and times out); the REST API does not have this problem.
          const html = await renderContent(this.env, url);
          const textContent = htmlToText(html);

          // Resolve the publication source (seeded sources carry brand colors).
          let sourceId: number | null = null;
          try {
            const resolved = await resolveSource(this.env, url);
            sourceId = resolved.id;
          } catch (err) {
            console.error(`Source resolution failed for ${url}:`, err);
          }

          // Captioned editorial images extracted from the rendered HTML.
          let pageImages: ExtractedImage[] = [];
          try {
            pageImages = extractImagesFromHtml(html, url);
          } catch (err) {
            console.error(`Image extraction failed for ${url}`, err);
          }

          // Viewport screenshot (cards), full-page screenshot (Screenshot tab),
          // and PDF are independent REST calls — run them in parallel,
          // best-effort (a failure here must not fail the whole render step).
          const screenshotKey = `screenshots/wf-${jobId}.jpg`;
          const fullScreenshotKey = `screenshots/wf-${jobId}-full.jpg`;
          const pdfKey = `pdf/wf-${jobId}.pdf`;

          const [viewportOk, fullOk, pdfOk] = await Promise.all([
            (async () => {
              try {
                const buf = await renderScreenshot(this.env, url, { quality: 75 });
                await this.env.SPAWNED_PWAS.put(screenshotKey, buf, {
                  httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000" },
                });
                return true;
              } catch (err) {
                console.error(`Screenshot failed for ${url}`, err);
                return false;
              }
            })(),
            (async () => {
              try {
                const buf = await renderScreenshot(this.env, url, { fullPage: true, quality: 70 });
                await this.env.SPAWNED_PWAS.put(fullScreenshotKey, buf, {
                  httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000" },
                });
                return true;
              } catch (err) {
                console.error(`Full-page screenshot failed for ${url}`, err);
                return false;
              }
            })(),
            (async () => {
              try {
                const buf = await renderPdf(this.env, url, {
                  margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
                });
                await this.env.SPAWNED_PWAS.put(pdfKey, buf, {
                  httpMetadata: { contentType: "application/pdf", cacheControl: "public, max-age=31536000" },
                });
                return true;
              } catch (err) {
                console.error(`PDF generation failed for ${url}`, err);
                return false;
              }
            })(),
          ]);

          return {
            textContent,
            screenshotKey: viewportOk ? screenshotKey : undefined,
            fullScreenshotKey: fullOk ? fullScreenshotKey : undefined,
            pdfKey: pdfOk ? pdfKey : undefined,
            sourceId,
            pageImages,
          };
        },
      );

      // Check content length before proceeding.
      if (renderResult.textContent.trim().length < MIN_CONTENT_LENGTH) {
        await step.do("mark-skipped", async () => {
          await updateJobProgress(this.env, jobId, {
            stage: 2,
            state: "done",
            title: "(content too short)",
          });
        });
        return { status: "skipped", reason: "Content too short for AI extraction" };
      }

      // ── Step 2.5: Bot-block detection ─────────────────────────────────
      // Detect anti-scraping / access-denied pages (Cloudflare challenge,
      // CAPTCHA, "Access Denied", paywall walls, …). If the scrape was blocked,
      // record the URL and stop — no article row is created, so it never reaches
      // the Newsstand; it shows on the Blocked page instead.
      const blockCheck = await step.do(
        "detect-block",
        { retries: { limit: 1, delay: "5 seconds", backoff: "constant" }, timeout: "60 seconds" },
        async () => detectBotBlock(this.env, renderResult.textContent),
      );

      if (blockCheck.blocked) {
        await step.do("mark-blocked", async () => {
          const db = getDb(this.env);
          await db
            .insert(blockedUrls)
            .values({ url, reason: blockCheck.reason || "bot blocked" })
            .onConflictDoUpdate({
              target: blockedUrls.url,
              set: { reason: blockCheck.reason || "bot blocked", createdAt: new Date() },
            });
          await updateJobProgress(this.env, jobId, {
            stage: 2,
            state: "done",
            title: "(bot blocked)",
          });
        });
        return { status: "bot_blocked", reason: blockCheck.reason };
      }

      // ── Step 3: Extract (structured article via llama-3.3-70b) ────────
      const extraction = await step.do(
        "extract",
        {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "180 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 3 });

          const result = await extractArticle(this.env, renderResult.textContent);
          return result;
        },
      );

      // ── Step 4: Images (upload to Cloudflare Images) ──────────────────
      const imagesResult = await step.do(
        "images",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "120 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 4 });

          // Drive uploads from the DOM-scraped images (real URLs + captions).
          // Kimi only ever sees the page's innerText, never the image URLs, so it
          // cannot supply them — the scraped list (already junk-filtered in the
          // render step) is the source of truth. Captioned images sort first.
          const scrapedImages = [...(renderResult.pageImages || [])].sort(
            (a, b) => (b.caption ? 1 : 0) - (a.caption ? 1 : 0),
          );

          // Upload each image and store results (DB rows inserted in index step).
          const uploaded: Array<{
            cfUrl: string;
            imageName: string;
            position: number;
            caption: string;
          }> = [];

          let position = 0;
          for (const img of scrapedImages.slice(0, 10)) {
            // Cap at 10 images per article. A single failing upload must not
            // fail the whole step (a retry would re-upload the ones that already
            // succeeded, duplicating them in Cloudflare Images).
            const imageName = (img.caption || img.alt || "Article image").slice(0, 200);
            try {
              const result = await uploadImageToCF(this.env, img.src, {
                articleId: 0, // Will be set after index step.
                imageName,
              });

              if (result) {
                uploaded.push({
                  cfUrl: result.url,
                  imageName,
                  position: position++,
                  caption: img.caption || "",
                });
              }
            } catch (err) {
              console.error(`Image upload failed for ${img.src}:`, err);
            }
          }

          return { uploaded };
        },
      );

      // ── Step 5: Embed (chunked) ────────────────────────────────────────
      const embedResult = await step.do(
        "embed",
        {
          retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
          timeout: "120 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 5 });

          // Generate the RAG UUID INSIDE the step so it is captured in the
          // cached step result. Generating it in the workflow body would
          // produce a new value on every replay/retry, desyncing the Vectorize
          // metadata from the indexed article row and breaking RAG search.
          const ragUuid = crypto.randomUUID();

          // Use cleaned content (HTML stripped to text) for better RAG quality.
          const contentForEmbedding = extraction.articleContent || renderResult.textContent;
          const chunks = chunkText(contentForEmbedding);

          // Embed each chunk and upsert with metadata.
          for (const chunk of chunks) {
            const vector = await embed(this.env, chunk.text);
            if (vector) {
              // Use a temp ID pattern; will re-key after article ID is known.
              await this.env.VECTORIZE.upsert([
                {
                  id: `pending-${jobId}-chunk-${chunk.index}`,
                  values: vector,
                  metadata: { rag_uuid: ragUuid, chunkIndex: chunk.index, url },
                },
              ]);
            }
          }

          return { chunkCount: chunks.length, ragUuid };
        },
      );

      // ── Step 6: Index ──────────────────────────────────────────────────
      const indexResult = await step.do(
        "index",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
          timeout: "60 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 6 });

          const db = getDb(this.env);

          // Derive the canonical title from extraction.
          const extractedTitle = extraction.articleTitle || extraction.topic || null;

          // Upsert article row (idempotent on URL).
          const inserted = await db
            .insert(articles)
            .values({
              url,
              title: extractedTitle,
              rawContent: renderResult.textContent,
              cleanContent: extraction.articleContent || null,
              ragUuid: embedResult.ragUuid,
              ...(renderResult.screenshotKey ? { screenshotKey: renderResult.screenshotKey } : {}),
              ...(renderResult.fullScreenshotKey
                ? { fullScreenshotKey: renderResult.fullScreenshotKey }
                : {}),
              ...(renderResult.pdfKey ? { pdfKey: renderResult.pdfKey } : {}),
              ...(renderResult.sourceId ? { sourceId: renderResult.sourceId } : {}),
            })
            .onConflictDoNothing()
            .returning({ id: articles.id });

          let articleId: number;
          if (inserted[0]) {
            articleId = inserted[0].id;
          } else {
            const existing = await db
              .select({ id: articles.id })
              .from(articles)
              .where(eq(articles.url, url))
              .limit(1);
            articleId = existing[0]?.id ?? 0;

            // Update existing row with new data.
            await db
              .update(articles)
              .set({
                title: extractedTitle,
                rawContent: renderResult.textContent,
                cleanContent: extraction.articleContent || null,
                ragUuid: embedResult.ragUuid,
                ...(renderResult.screenshotKey
                  ? { screenshotKey: renderResult.screenshotKey }
                  : {}),
                ...(renderResult.fullScreenshotKey
                  ? { fullScreenshotKey: renderResult.fullScreenshotKey }
                  : {}),
                ...(renderResult.pdfKey ? { pdfKey: renderResult.pdfKey } : {}),
                ...(renderResult.sourceId ? { sourceId: renderResult.sourceId } : {}),
              })
              .where(eq(articles.id, articleId));
          }

          // This URL processed successfully — clear any prior bot-block record.
          try {
            await db.delete(blockedUrls).where(eq(blockedUrls.url, url));
          } catch (err) {
            console.error(`Clearing block record failed for ${url}`, err);
          }

          // Persist AI-extracted properties from the structured extraction.
          const extractedProps: Record<string, string> = {};
          if (extraction.articleTitle) extractedProps.title = extraction.articleTitle;
          if (extraction.summary) extractedProps.summary = extraction.summary;
          if (extraction.topic) extractedProps.topic = extraction.topic;
          if (extraction.source) extractedProps.source = extraction.source;
          if (extraction.author) extractedProps.author = extraction.author;
          if (extraction.datePublished) extractedProps.publishedDate = extraction.datePublished;

          if (Object.keys(extractedProps).length > 0) {
            const pending: PendingProperty[] = [{ articleId, data: extractedProps }];
            await persistProperties(this.env, pending);
          }

          // Insert article_images rows from the images step.
          try {
            const uploadedImages = imagesResult.uploaded || [];
            for (const img of uploadedImages) {
              await db.insert(articleImages).values({
                articleId,
                imageName: img.imageName,
                imageCfUrl: img.cfUrl,
                position: img.position,
                caption: img.caption || null,
              });
            }
          } catch (err) {
            console.error(`article_images insert failed for article ${articleId}`, err);
          }

          // Re-key Vectorize vectors with real article ID.
          try {
            const contentForEmbedding = extraction.articleContent || renderResult.textContent;
            const chunks = chunkText(contentForEmbedding);

            for (const chunk of chunks) {
              const vector = await embed(this.env, chunk.text);
              if (vector) {
                await this.env.VECTORIZE.upsert([
                  {
                    id: `${articleId}-chunk-${chunk.index}`,
                    values: vector,
                    metadata: { rag_uuid: embedResult.ragUuid, articleId, chunkIndex: chunk.index, url },
                  },
                ]);
              }
            }

            // Delete temporary pending vectors.
            const pendingIds = chunks.map((c) => `pending-${jobId}-chunk-${c.index}`);
            if (pendingIds.length > 0) {
              await this.env.VECTORIZE.deleteByIds(pendingIds);
            }
          } catch (err) {
            console.error(`Vectorize re-upsert failed for article ${articleId}`, err);
          }

          // Also re-key screenshot with standardized name.
          if (renderResult.screenshotKey) {
            try {
              const standardKey = `screenshots/${articleId}.jpg`;
              if (renderResult.screenshotKey !== standardKey) {
                const obj = await this.env.SPAWNED_PWAS.get(renderResult.screenshotKey);
                if (obj) {
                  await this.env.SPAWNED_PWAS.put(standardKey, obj.body, {
                    httpMetadata: {
                      contentType: "image/jpeg",
                      cacheControl: "public, max-age=31536000",
                    },
                  });
                  await db
                    .update(articles)
                    .set({ screenshotKey: standardKey })
                    .where(eq(articles.id, articleId));
                }
              }
            } catch (err) {
              console.error(`Screenshot re-key failed for article ${articleId}`, err);
            }
          }

          // Re-key the full-page screenshot with the standardized name.
          if (renderResult.fullScreenshotKey) {
            try {
              const standardKey = `screenshots/${articleId}-full.jpg`;
              if (renderResult.fullScreenshotKey !== standardKey) {
                const obj = await this.env.SPAWNED_PWAS.get(renderResult.fullScreenshotKey);
                if (obj) {
                  await this.env.SPAWNED_PWAS.put(standardKey, obj.body, {
                    httpMetadata: {
                      contentType: "image/jpeg",
                      cacheControl: "public, max-age=31536000",
                    },
                  });
                  await db
                    .update(articles)
                    .set({ fullScreenshotKey: standardKey })
                    .where(eq(articles.id, articleId));
                }
              }
            } catch (err) {
              console.error(`Full-page screenshot re-key failed for article ${articleId}`, err);
            }
          }

          // Re-key PDF with standardized name.
          if (renderResult.pdfKey) {
            try {
              const standardKey = `pdf/${articleId}.pdf`;
              if (renderResult.pdfKey !== standardKey) {
                const obj = await this.env.SPAWNED_PWAS.get(renderResult.pdfKey);
                if (obj) {
                  await this.env.SPAWNED_PWAS.put(standardKey, obj.body, {
                    httpMetadata: {
                      contentType: "application/pdf",
                      cacheControl: "public, max-age=31536000",
                    },
                  });
                  await db
                    .update(articles)
                    .set({ pdfKey: standardKey })
                    .where(eq(articles.id, articleId));
                }
              }
            } catch (err) {
              console.error(`PDF re-key failed for article ${articleId}`, err);
            }
          }

          const title = extraction.articleTitle || extraction.topic || url;
          await updateJobProgress(this.env, jobId, {
            stage: 6,
            title,
            articleId,
          });

          return { articleId, title };
        },
      );

      // ── Step 7: Tags ───────────────────────────────────────────────────
      const tagResult = await step.do(
        "tags",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "120 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 7 });

          const title = indexResult.title ?? url;
          const result = await assignArticleTags(
            this.env,
            indexResult.articleId,
            renderResult.textContent,
            title,
          );

          return result;
        },
      );

      // ── Step 8: Mind Map ──────────────────────────────────────────────
      await step.do(
        "mindmap",
        {
          retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
          timeout: "120 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 8 });

          const title = indexResult.title ?? url;
          // Prefer Kimi-cleaned content (no nav/footer junk) for better mind maps.
          const contentForMindMap = extraction.articleContent || renderResult.textContent;
          const mindMapData = await generateMindMapData(this.env, contentForMindMap, title);

          const mindmapJson = JSON.stringify(mindMapData);

          // Save mind map JSON to R2 (backup / export).
          const mindmapKey = `mindmaps/article-${indexResult.articleId}.json`;
          await this.env.SPAWNED_PWAS.put(mindmapKey, mindmapJson, {
            httpMetadata: {
              contentType: "application/json",
              cacheControl: "public, max-age=86400",
            },
          });

          // Update article row with BOTH the R2 key AND inline JSON for instant rendering.
          const db = getDb(this.env);
          await db
            .update(articles)
            .set({ mindmapKey, mindmapData: mindmapJson })
            .where(eq(articles.id, indexResult.articleId));

          return { mindmapKey };
        },
      );

      // ── Step 9: Audio (full article narration, chunked TTS) ────────────
      await step.do(
        "audio",
        {
          retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
          timeout: "300 seconds",
        },
        async () => {
          await updateJobProgress(this.env, jobId, { stage: 9 });

          // Use Kimi-cleaned content for narration — no junk metadata.
          const textForNarration = extraction.articleContent || renderResult.textContent;
          if (textForNarration.trim().length < 200) {
            return { audioKey: null };
          }

          const voice = await getConfiguredVoice(this.env);

          try {
            const audioBytes = await narrateFullArticle(this.env, textForNarration, voice);
            const audioKey = `audio/article-${indexResult.articleId}.mp3`;

            await this.env.SPAWNED_PWAS.put(audioKey, audioBytes, {
              httpMetadata: {
                contentType: "audio/mpeg",
                cacheControl: "public, max-age=86400",
              },
            });

            const db = getDb(this.env);
            await db
              .update(articles)
              .set({ audioKey })
              .where(eq(articles.id, indexResult.articleId));

            return { audioKey };
          } catch (err) {
            // Audio generation is non-critical — log and continue.
            console.error(`TTS generation failed for article ${indexResult.articleId}:`, err);
            return { audioKey: null };
          }
        },
      );

      // ── Done ───────────────────────────────────────────────────────────
      await step.do("finalize", async () => {
        await updateJobProgress(this.env, jobId, {
          stage: 9,
          state: "done",
        });
      });

      return {
        status: "archived",
        articleId: indexResult.articleId,
        title: indexResult.title,
        tagsApplied: tagResult.appliedTagIds.length,
        newTagsCreated: tagResult.newlyCreatedTags,
      };
    } catch (err) {
      // A step exhausted its retries and the workflow is failing. Mark the job
      // so the Processing UI shows the error instead of a row stuck on "active".
      try {
        await updateJobProgress(this.env, jobId, {
          state: "err",
          error: err instanceof Error ? err.message : String(err),
        });
      } catch {
        // best-effort
      }
      throw err;
    }
  }
}
