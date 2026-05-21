/**
 * @fileoverview Main Hono API router
 *
 * This file sets up the main Hono application with all API routes and middleware.
 */

import type {
  D1Database,
  Ai,
  VectorizeIndex,
  Fetcher,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";

import puppeteer from "@cloudflare/puppeteer";
import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import * as schema from "../db/schemas/index";
import { aiRouter } from "./routes/ai";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { documentsRouter } from "./routes/documents";
import { notificationsRouter } from "./routes/notifications";
import { threadsRouter } from "./routes/threads";

export type Bindings = {
  DB: D1Database;
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  BROWSER: Fetcher;
  NEWS_AGENT: DurableObjectNamespace;
  AI_GATEWAY_ID: string;
  CF_ACCOUNT_ID: string;
  AI_GATEWAY_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
};

export type Variables = {
  userId?: number;
  user?: {
    id: number;
    email: string;
    name: string;
  };
};

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

// Middleware
app.use("*", cors());
app.use("*", logger());

// Health check and standard endpoints
app.get("/api/ping", (c) => c.json({ status: "ok", timestamp: Date.now() }));
app.get("/context", (c) => c.json({ env: "production", version: "1.0.0" }));
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/docs", (c) => c.text("API Documentation is available at /swagger or /scalar."));

// OpenAPI Generators
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { version: "1.0.0", title: "News Archiver API" },
});
app.get("/swagger", swaggerUI({ url: "/openapi.json" }));
app.get("/scalar", apiReference({ spec: { url: "/openapi.json" } }));

// Ingestion API Route
const ingestRoute = createRoute({
  method: "post",
  path: "/api/ingest",
  request: {
    body: {
      content: { "application/json": { schema: z.object({ urlsString: z.string() }) } },
    },
  },
  responses: {
    202: {
      content: { "application/json": { schema: z.object({ status: z.string() }) } },
      description: "Batch Accepted",
    },
  },
});

app.openapi(ingestRoute, async (c) => {
  const { urlsString } = c.req.valid("json");

  // Rigorous URL extraction - handles multiple formats (iOS share sheet, comma-separated, newlines, etc.)
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const extractedUrls = urlsString.match(urlRegex) || [];
  const urls = [...new Set(extractedUrls)].filter((url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  });

  // Asynchronously process to avoid blocking the HTTP response
  c.executionCtx.waitUntil(
    (async () => {
      const db = drizzle(c.env.DB, { schema });
      const browser = await puppeteer.launch(c.env.BROWSER);

      // Define JSON schema for Workers AI structured outputs
      const extractionSchema = {
        type: "object",
        properties: {
          source: { type: "string" },
          author: { type: "string" },
          topic: { type: "string" },
          summary: { type: "string" },
          title: { type: "string" },
        },
        required: ["source", "author", "topic", "summary", "title"],
      };

      for (const link of urls) {
        try {
          const [article] = await db
            .insert(schema.articles)
            .values({ url: link })
            .onConflictDoNothing()
            .returning();

          if (!article) continue;

          const page = await browser.newPage();
          await page.goto(article.url, { waitUntil: "networkidle0", timeout: 30000 });

          // Smart screenshot capture with popup handling
          try {
            // Wait a bit for any late-loading elements
            await page.waitForTimeout(2000);

            // Attempt to dismiss common popups/overlays
            const dismissSelectors = [
              'button[aria-label*="close" i]',
              'button[aria-label*="dismiss" i]',
              ".cookie-banner button",
              "#onetrust-accept-btn-handler",
              '[class*="cookie"] button[class*="accept"]',
              '[class*="modal"] [class*="close"]',
              '[class*="popup"] [class*="close"]',
            ];

            for (const selector of dismissSelectors) {
              try {
                const element = await page.$(selector);
                if (element) {
                  await element.click();
                  await page.waitForTimeout(500);
                }
              } catch {}
            }

            // Scroll to capture hero image if present
            await page.evaluate(() => window.scrollTo(0, 200));
            await page.waitForTimeout(1000);

            // Take screenshot (focus on article content area if present)
            const screenshotBuffer = await page.screenshot({
              type: "jpeg",
              quality: 85,
              fullPage: false,
            });

            // For now, we'll store as base64 data URL (in production, upload to R2)
            const screenshotDataUrl = `data:image/jpeg;base64,${screenshotBuffer.toString("base64")}`;

            // Update article with screenshot
            await db
              .update(schema.articles)
              .set({ screenshotUrl: screenshotDataUrl })
              .where(eq(schema.articles.id, article.id));
          } catch (screenshotErr) {
            console.error(`Screenshot failed for ${link}:`, screenshotErr);
          }

          const textContent = await page.evaluate(() => document.body.innerText);
          await page.close();

          await db
            .update(schema.articles)
            .set({ rawContent: textContent })
            .where(eq(schema.articles.id, article.id));

          // AI Structured Extraction via AI Gateway with JSON Schema
          const aiResponse: any = await c.env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct",
            {
              messages: [
                {
                  role: "user",
                  content: `Extract source, author, topic, title, and summary from this article text:\n\n${textContent.substring(0, 4000)}`,
                },
              ],
              response_format: {
                type: "json_schema",
                json_schema: { schema: extractionSchema },
              },
            },
            { gateway: { id: c.env.AI_GATEWAY_ID } },
          );

          const structuredData: Record<string, string> =
            aiResponse.response?.parsed || aiResponse.response || {};

          // Batch optimization: Collect all property keys first
          const propertyEntries = Object.entries(structuredData);
          const propertyKeysToCheck = propertyEntries.map(([key]) => key);

          // Batch read existing property keys using inArray
          let existingKeys = [];
          if (propertyKeysToCheck.length > 0) {
            existingKeys = await db
              .select()
              .from(schema.propertyKeys)
              .where(inArray(schema.propertyKeys.key, propertyKeysToCheck));
          }

          const existingKeyMap = new Map(existingKeys.map((k) => [k.key, k.id]));

          // Identify new keys that need to be inserted
          const newKeys = propertyKeysToCheck.filter((k) => !existingKeyMap.has(k));

          // Batch insert new property keys (respecting D1 limit of ~100 params)
          if (newKeys.length > 0) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < newKeys.length; i += BATCH_SIZE) {
              const batch = newKeys.slice(i, i + BATCH_SIZE);
              const insertedKeys = await db
                .insert(schema.propertyKeys)
                .values(batch.map((key) => ({ key })))
                .onConflictDoNothing()
                .returning();

              insertedKeys.forEach((k) => existingKeyMap.set(k.key, k.id));
            }
          }

          // Batch insert article properties
          const propertyValues = propertyEntries.map(([key, value]) => ({
            articleId: article.id,
            propertyId: existingKeyMap.get(key)!,
            value: String(value),
          }));

          if (propertyValues.length > 0) {
            const BATCH_SIZE = 50;
            for (let i = 0; i < propertyValues.length; i += BATCH_SIZE) {
              const batch = propertyValues.slice(i, i + BATCH_SIZE);
              await db.insert(schema.articleProperties).values(batch);
            }
          }

          // Generate Embeddings
          const embeddingRes = await c.env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: [textContent.substring(0, 2000)],
            },
            { gateway: { id: c.env.AI_GATEWAY_ID } },
          );

          await c.env.VECTORIZE.upsert([
            {
              id: article.id.toString(),
              values: embeddingRes.data[0],
              metadata: { url: article.url },
            },
          ]);
        } catch (err) {
          console.error(`Failed processing ${link}`, err);
        }
      }
      await browser.close();
    })(),
  );

  return c.json({ status: "Processing started", urlsFound: urls.length }, 202);
});

// Route WebSocket connections to the Agent
app.all("/api/chat/*", async (c) => {
  const agentId = c.env.NEWS_AGENT.idFromName("global-agent");
  const agent = c.env.NEWS_AGENT.get(agentId);
  return agent.fetch(c.req.raw);
});

// Mount existing routers
app.route("/api/auth", authRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/threads", threadsRouter);
// app.route("/api/health", healthRouter); // using root health instead
app.route("/api/notifications", notificationsRouter);
app.route("/api/ai", aiRouter);
app.route("/api/documents", documentsRouter);
// app.route("/", openapiRouter); // replaced with root openapi generators

export { app };
