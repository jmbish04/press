/**
 * @fileoverview Article submission REST API.
 *
 * `POST /api/articles/submit` — accepts URLs as an array or a free-form string
 * (for iOS share-sheet dumps). Creates a Cloudflare Workflow instance per URL
 * for durable, retriable processing. Progress is tracked in the `ingestion_jobs`
 * D1 table and visible from `GET /api/processing/jobs`.
 *
 * Aggregator/redirector URLs (e.g. news.google.com) are rejected with a clear
 * instruction to submit actual article URLs instead.
 *
 * Protected by the `WORKER_API_KEY` Secrets Store binding.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { OpenAPIHono } from "@hono/zod-openapi";

import { extractUrlsWithRejections } from "../../ai/ingest/extractUrls";
import { getDb } from "../../db";
import { ingestionJobs } from "../../db/schemas";
import { apiKeyMiddleware } from "../middleware/apiKey";

const SubmitResultSchema = z.object({
  jobId: z.string(),
  url: z.string(),
  status: z.enum(["queued", "duplicate"]),
});

const RejectedUrlSchema = z.object({
  url: z.string(),
  reason: z.string(),
});

const submitRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Articles"],
  summary: "Submit articles for archiving (Workflow-backed)",
  description:
    `Submit one or more article URLs for ingestion. Each URL creates a durable
Cloudflare Workflow instance that processes through 8 steps: fetch, render,
extract, embed, index, tags, mind-map, and audio generation.

Aggregator/redirector URLs (e.g. news.google.com) are rejected with an
instruction to submit the actual article URL instead.

Accepts either a structured \`urls\` array or a free-form \`urlsString\`
(for iOS share-sheet dumps).`,
  request: {
    body: {
      content: {
        "application/json": {
          schema: z
            .object({
              urls: z
                .array(z.string().url())
                .optional()
                .describe("Array of article URLs to archive"),
              urlsString: z
                .string()
                .optional()
                .describe("Free-form text containing URLs (e.g. from an iOS share sheet)"),
            })
            .refine(
              (d) =>
                (d.urls && d.urls.length > 0) || (d.urlsString && d.urlsString.trim().length > 0),
              {
                message: "Provide either `urls` (array) or `urlsString` (free-form text)",
              },
            ),
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        "application/json": {
          schema: z.object({
            accepted: z.number(),
            results: z.array(SubmitResultSchema),
            rejected: z.array(RejectedUrlSchema).optional(),
            message: z.string().optional(),
          }),
        },
      },
      description: "Workflow instances created per URL",
    },
    400: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.string(),
            rejected: z.array(RejectedUrlSchema).optional(),
          }),
        },
      },
      description: "No valid URLs found",
    },
  },
});

export const submitRouter = new OpenAPIHono<{ Bindings: Env }>();

submitRouter.use("*", apiKeyMiddleware);

submitRouter.openapi(submitRoute, async (c) => {
  const body = c.req.valid("json");

  // Merge both input styles into a single text blob for extraction.
  let rawText = "";
  if (body.urls && body.urls.length > 0) {
    rawText += body.urls.join("\n") + "\n";
  }
  if (body.urlsString) {
    rawText += body.urlsString;
  }

  const { accepted: validUrls, rejected } = extractUrlsWithRejections(rawText);

  // Deduplicate accepted URLs.
  const urls = [...new Set(validUrls)];

  if (urls.length === 0) {
    const errorMsg = rejected.length > 0
      ? "All submitted URLs were rejected. Please submit the actual article URLs, not aggregator/redirector links."
      : "No valid article URLs found in the provided input.";
    return c.json(
      { error: errorMsg, ...(rejected.length > 0 ? { rejected } : {}) } as any,
      400,
    );
  }

  const db = getDb(c.env);
  const results: Array<{ jobId: string; url: string; status: "queued" | "duplicate" }> = [];

  for (const url of urls) {
    const jobId = crypto.randomUUID();

    try {
      await db.insert(ingestionJobs).values({
        id: jobId,
        url,
        state: "active",
        stage: 0,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (c.env as any).ARTICLE_INGESTION.create({
        id: jobId,
        params: { jobId, url },
      });

      results.push({ jobId, url, status: "queued" });
    } catch (err) {
      console.error(`Failed to create workflow for ${url}:`, err);
      results.push({ jobId, url, status: "duplicate" });
    }
  }

  const response: Record<string, unknown> = { accepted: urls.length, results };

  if (rejected.length > 0) {
    response.rejected = rejected;
    response.message =
      "Some URLs were rejected because they point to aggregator/redirector sites. Please resolve these to the actual article URLs and resubmit them.";
  }

  return c.json(response as any, 202);
});
