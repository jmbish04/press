/**
 * @fileoverview Tool definitions for the ArticleChatAgent.
 *
 * Tools:
 *   - search_sources     — RAG scoped to pinned article sources
 *   - set_session_sources — pin articles as conversation sources
 *   - search_archive     — RAG across the whole archive
 *   - spawn_artifact     — generate + deploy a PWA / mind map / summary card
 *   - iterate_artifact   — iterate on an existing artifact (creates new version)
 *   - archive_article    — ingest URLs shared mid-conversation
 */

import { tool } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ChatToolContext } from "../types";

import { getDb } from "../../../../db";
import { spawnedArtifacts } from "../../../../db/schemas";
import { extractUrls } from "../../../ingest/extractUrls";
import { ingestionJobs } from "../../../../db/schemas";
import { retrieveArticleContext } from "../../../rag/articleRag";
import { spawnArtifact } from "./spawnArtifact";

/** Builds the agent's AI SDK tool set bound to a session context. */
export function buildArticleChatTools(ctx: ChatToolContext) {
  return {
    search_sources: tool({
      description:
        `Search the currently pinned article sources for relevant context.
Use before answering any factual question.`,
      inputSchema: z.object({
        query: z.string().describe("Semantic search query"),
      }),
      execute: async ({ query }) => {
        const pinned = ctx.getPinned();
        if (pinned.length === 0) {
          return "No articles are pinned to this session. Ask the user to select sources.";
        }
        const context = await retrieveArticleContext(ctx.env, query, pinned, 10);
        return context || "No relevant passages were found in the pinned sources.";
      },
    }),

    set_session_sources: tool({
      description:
        `Pin a list of article IDs as the sources for this conversation.
Call this when the user selects articles.`,
      inputSchema: z.object({
        articleIds: z.array(z.number()),
        sessionName: z.string().optional(),
      }),
      execute: async ({ articleIds, sessionName }) => {
        ctx.setSources(articleIds, sessionName);
        return {
          pinned: articleIds.length,
          message: `${articleIds.length} article(s) are now active as sources.`,
        };
      },
    }),

    search_archive: tool({
      description:
        `Semantic search across ALL archived articles, not just pinned sources.
Useful for discovering new relevant articles.`,
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().min(1).max(20).default(5),
      }),
      execute: async ({ query, limit }) => {
        const context = await retrieveArticleContext(ctx.env, query, [], limit);
        return context || "No matching articles were found in the archive.";
      },
    }),

    spawn_artifact: tool({
      description:
        `Generate and deploy a visual artifact (pwa, mindmap, or summary-card) to R2.
Takes ~10-15 seconds. Confirm intent with the user before calling.
Use iterateArtifactId to create a new version of an existing artifact.`,
      inputSchema: z.object({
        type: z.enum(["pwa", "mindmap", "summary-card"]),
        title: z.string().describe("Human-readable title for the artifact"),
        articleIds: z
          .array(z.number())
          .optional()
          .describe("Leave empty to use all pinned sources"),
        brief: z.string().optional().describe("Extra instructions for the generator"),
        iterateArtifactId: z
          .string()
          .optional()
          .describe("ID of a previous artifact to iterate on (creates a new version)"),
      }),
      execute: async (input) => spawnArtifact(ctx, input),
    }),

    iterate_artifact: tool({
      description:
        `Iterate on an existing PWA artifact with changes. Creates a new version
linked to the previous one via a version chain. Fetches the original HTML
from R2, modifies it according to the changes description, and deploys
the updated version.`,
      inputSchema: z.object({
        artifactId: z.string().describe("ID of the artifact to iterate on"),
        changes: z.string().describe("Description of changes to make to the artifact"),
      }),
      execute: async ({ artifactId, changes }) => {
        const db = getDb(ctx.env);

        // Fetch the previous artifact.
        const [prev] = await db
          .select()
          .from(spawnedArtifacts)
          .where(eq(spawnedArtifacts.id, artifactId))
          .limit(1);

        if (!prev) return { error: "Previous artifact not found." };

        // Parse the source article IDs from the previous artifact.
        let articleIds: number[] = [];
        try {
          articleIds = JSON.parse(prev.sourceArticleIds ?? prev.articleIds);
        } catch {
          articleIds = [];
        }

        // Spawn a new version with the changes as the brief.
        return spawnArtifact(ctx, {
          type: prev.type,
          title: prev.title,
          articleIds,
          brief: `ITERATE on the previous version. Changes requested:\n${changes}`,
          iterateArtifactId: artifactId,
        });
      },
    }),

    archive_article: tool({
      description:
        `Queue one or more URLs for archiving via the durable ingestion workflow.
Use when the user shares links mid-conversation. Progress is tracked on the Processing page.`,
      inputSchema: z.object({
        urls: z.string().describe("Text containing one or more URLs to archive"),
      }),
      execute: async ({ urls }) => {
        const list = extractUrls(urls);
        if (list.length === 0) return "No valid URLs were found in the provided text.";

        const db = getDb(ctx.env);
        const results: string[] = [];

        for (const url of list) {
          const jobId = crypto.randomUUID();
          try {
            await db.insert(ingestionJobs).values({
              id: jobId,
              url,
              source: "chat",
              state: "active",
              stage: 0,
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (ctx.env as any).ARTICLE_INGESTION.create({
              id: jobId,
              params: { jobId, url, source: "chat" },
            });
            results.push(`✅ Queued: ${url}`);
          } catch (err) {
            results.push(`❌ Failed: ${url} (${err instanceof Error ? err.message : String(err)})`);
          }
        }

        return `Submitted ${list.length} URL(s) for processing:\n${results.join("\n")}`;
      },
    }),
  };
}
