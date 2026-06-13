/**
 * @fileoverview MCP tool: search_archive
 *
 * Vectorize similarity search over the archived article corpus, returning
 * structured article digests with titles, summaries, and excerpts.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { z } from "zod";

import { retrieveArticleDigests } from "../../../rag/articleRag";

export function registerSearchArchiveTool(server: McpServer, env: Env): void {
  server.tool(
    "search_archive",
    "Search the archived article corpus using semantic similarity. Returns article titles, summaries, and excerpts ranked by relevance.",
    {
      query: z.string().min(1).describe("Natural language search query"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Maximum number of results to return (default: 5)"),
    } as any,
    async (args: any) => {
      const { query, limit } = args;
      try {
        const digests = await retrieveArticleDigests(env, query, [], limit ?? 5);

        if (digests.length === 0) {
          return {
            content: [
              { type: "text" as const, text: "No matching articles found in the archive." },
            ],
          };
        }

        const formatted = digests
          .map((d, i) => {
            const parts = [`### ${i + 1}. ${d.title}`, `**URL:** ${d.url}`, `**ID:** ${d.id}`];
            if (d.summary) parts.push(`**Summary:** ${d.summary}`);
            if (d.excerpt) parts.push(`\n${d.excerpt}`);
            return parts.join("\n");
          })
          .join("\n\n---\n\n");

        return {
          content: [
            { type: "text" as const, text: `Found ${digests.length} article(s):\n\n${formatted}` },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
