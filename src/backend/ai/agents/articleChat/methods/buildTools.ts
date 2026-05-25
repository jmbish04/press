/**
 * @fileoverview Tool definitions for the ArticleChatAgent.
 */

import { tool } from "ai";
import { z } from "zod";

import type { ChatToolContext } from "../types";

import { extractUrls } from "../../../ingest/extractUrls";
import { ingestUrls } from "../../../ingest/ingestUrls";
import { retrieveArticleContext } from "../../../rag/articleRag";
import { spawnArtifact } from "./spawnArtifact";

/** Builds the agent's AI SDK tool set bound to a session context. */
export function buildArticleChatTools(ctx: ChatToolContext) {
  return {
    search_sources: tool({
      description:
        "Search the currently pinned article sources for relevant context. " +
        "Use before answering any factual question.",
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
        "Pin a list of article IDs as the sources for this conversation. " +
        "Call this when the user selects articles.",
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
        "Semantic search across ALL archived articles, not just pinned sources. " +
        "Useful for discovering new relevant articles.",
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
        "Generate and deploy a visual artifact (pwa, mindmap, or summary-card) to R2. " +
        "Takes ~10-15 seconds. Confirm intent with the user before calling.",
      inputSchema: z.object({
        type: z.enum(["pwa", "mindmap", "summary-card"]),
        title: z.string().describe("Human-readable title for the artifact"),
        articleIds: z
          .array(z.number())
          .optional()
          .describe("Leave empty to use all pinned sources"),
        brief: z.string().optional().describe("Extra instructions for the generator"),
      }),
      execute: async (input) => spawnArtifact(ctx, input),
    }),

    archive_article: tool({
      description:
        "Fetch, render, and archive one or more URLs into the article store using " +
        "Browser Rendering. Use when the user shares links mid-conversation.",
      inputSchema: z.object({
        urls: z.string().describe("Text containing one or more URLs to archive"),
      }),
      execute: async ({ urls }) => {
        const list = extractUrls(urls);
        if (list.length === 0) return "No valid URLs were found in the provided text.";
        return ingestUrls(ctx.env, list);
      },
    }),
  };
}
