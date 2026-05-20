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
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import * as schema from "../db/schema";
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
  const urls = urlsString.split(/\s+/).filter(Boolean);

  // Asynchronously process to avoid blocking the HTTP response
  c.executionCtx.waitUntil(
    (async () => {
      const db = drizzle(c.env.DB, { schema });
      const browser = await puppeteer.launch(c.env.BROWSER);

      for (const link of urls) {
        if (!link.trim()) continue;

        try {
          const [article] = await db
            .insert(schema.articles)
            .values({ url: link.trim() })
            .onConflictDoNothing()
            .returning();

          if (!article) continue;

          const page = await browser.newPage();
          await page.goto(article.url, { waitUntil: "domcontentloaded" });
          const textContent = await page.evaluate(() => document.body.innerText);
          await page.close();

          await db
            .update(schema.articles)
            .set({ rawContent: textContent })
            .where(eq(schema.articles.id, article.id));

          // AI Structured Extraction via AI Gateway
          const prompt = `Extract 'source', 'author', 'topic', and 'summary' from this text. Return strictly valid JSON.\n\nText:\n${textContent.substring(0, 4000)}`;
          const aiResponse = await c.env.AI.run(
            "@cf/meta/llama-3.1-8b-instruct",
            {
              messages: [{ role: "user", content: prompt }],
            },
            { gateway: { id: c.env.AI_GATEWAY_ID, account: c.env.CF_ACCOUNT_ID } },
          );

          let structuredData: Record<string, string> = {};
          try {
            const jsonStr = (aiResponse.response as string).replace(/```json|```/g, "");
            structuredData = JSON.parse(jsonStr);
          } catch (e) {
            console.error("JSON parse fail", e);
          }

          // Loop over the structured response and save every property key into the mapping table
          for (const [key, value] of Object.entries(structuredData)) {
            let [propKey] = await db
              .select()
              .from(schema.propertyKeys)
              .where(eq(schema.propertyKeys.key, key));
            if (!propKey) {
              [propKey] = await db.insert(schema.propertyKeys).values({ key }).returning();
            }
            await db.insert(schema.articleProperties).values({
              articleId: article.id,
              propertyId: propKey.id,
              value: String(value),
            });
          }

          // Generate Embeddings
          const embeddingRes = await c.env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: [textContent.substring(0, 2000)],
            },
            { gateway: { id: c.env.AI_GATEWAY_ID, account: c.env.CF_ACCOUNT_ID } },
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

  return c.json({ status: "Processing started" }, 202);
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
