/**
 * @fileoverview PressMcpAgent — a remote MCP server for the Press archive.
 *
 * Extends `McpAgent` (Durable Object) and exposes tools for submitting,
 * searching, and browsing archived articles via the Model Context Protocol.
 * Served at `/mcp` with Streamable HTTP transport (SSE fallback).
 *
 * Tools:
 *   - submit_article — ingest URLs via Browser Rendering + AI extraction
 *   - search_archive — Vectorize RAG similarity search
 *   - list_articles  — browse the D1 archive with metadata
 *   - get_article    — full article detail by ID
 *
 * Resource:
 *   - mcp://press/stats — archive statistics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { count } from "drizzle-orm";

import { getDb } from "../../../db";
import { articles } from "../../../db/schemas";
import { registerBrowseArticlesTools } from "./tools/browseArticles";
import { registerSearchArchiveTool } from "./tools/searchArchive";
import { registerSubmitArticleTool } from "./tools/submitArticle";

export class PressMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "Press Archive",
    version: "1.0.0",
  }) as any;

  async init(): Promise<void> {
    // ── Tools ──────────────────────────────────────────────────────────
    registerSubmitArticleTool(this.server, this.env);
    registerSearchArchiveTool(this.server, this.env);
    registerBrowseArticlesTools(this.server, this.env);

    // ── Resources ──────────────────────────────────────────────────────
    this.server.resource("archive_stats", "mcp://press/stats", async () => {
      try {
        const db = getDb(this.env);
        const [result] = await db.select({ total: count(articles.id) }).from(articles);
        const total = result?.total ?? 0;

        return {
          contents: [
            {
              uri: "mcp://press/stats",
              mimeType: "application/json",
              text: JSON.stringify({ totalArticles: total, updatedAt: new Date().toISOString() }),
            },
          ],
        };
      } catch (err) {
        return {
          contents: [
            {
              uri: "mcp://press/stats",
              mimeType: "text/plain",
              text: `Failed to load stats: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    });
  }
}
