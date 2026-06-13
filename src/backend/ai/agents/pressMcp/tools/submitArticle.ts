/**
 * @fileoverview MCP tool: submit_article
 *
 * Accepts a list of URLs and queues them through the Cloudflare Workflow-backed
 * ingestion pipeline. Each URL creates an `ingestion_jobs` D1 row and spawns
 * an `ArticleIngestionWorkflow` instance for durable, retriable processing.
 *
 * Progress is visible on the Processing frontend page.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { z } from "zod";

import { extractUrlsWithRejections } from "../../../ingest/extractUrls";
import { getDb } from "../../../../db";
import { ingestionJobs } from "../../../../db/schemas";

export function registerSubmitArticleTool(server: McpServer, env: Env): void {
  server.tool(
    "submit_article",
    "Submit one or more article URLs for archiving. URLs are queued as durable Workflow instances with full pipeline tracking (fetch → render → extract → embed → index → tags → mindmap → audio). Progress appears on the Processing page.",
    { urls: z.array(z.string().url()).min(1).describe("Array of article URLs to archive") } as any,
    async (args: any) => {
      const { urls } = args;
      const { accepted: cleaned, rejected } = extractUrlsWithRejections(urls.join("\n"));

      if (cleaned.length === 0) {
        const rejectionInfo = rejected.length > 0
          ? `\n\nRejected URLs:\n${rejected.map((r) => `• ${r.url} — ${r.reason}`).join("\n")}\n\nPlease submit the actual article URLs, not aggregator/redirector links.`
          : "";
        return {
          content: [{ type: "text" as const, text: `No valid article URLs found.${rejectionInfo}` }],
          isError: true,
        };
      }

      try {
        const db = getDb(env);
        const results: Array<{ jobId: string; url: string; status: "queued" | "duplicate" }> = [];

        for (const url of cleaned) {
          const jobId = crypto.randomUUID();

          try {
            // Create the D1 job row for Processing page tracking.
            await db.insert(ingestionJobs).values({
              id: jobId,
              url,
              source: "mcp",
              state: "active",
              stage: 0,
            });

            // Create the durable Workflow instance.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (env as any).ARTICLE_INGESTION.create({
              id: jobId,
              params: { jobId, url, source: "mcp" },
            });

            results.push({ jobId, url, status: "queued" });
          } catch (err) {
            console.error(`Failed to create workflow for ${url}:`, err);
            results.push({ jobId, url, status: "duplicate" });
          }
        }

        const queued = results.filter((r) => r.status === "queued").length;
        const dupes = results.filter((r) => r.status === "duplicate").length;

        const summary = results
          .map((r) => {
            const icon = r.status === "queued" ? "✅" : "⏭️";
            return `${icon} ${r.status === "queued" ? "Queued" : "Skipped"}: ${r.url}`;
          })
          .join("\n");

        const header = `Submitted ${results.length} URL(s): ${queued} queued for processing, ${dupes} skipped/duplicate.\nProgress is visible on the Processing page.\n\n`;

        let rejectionInfo = "";
        if (rejected.length > 0) {
          rejectionInfo = `\n\n⚠️ Rejected URLs (aggregator/redirector — resolve to actual article URLs):\n${rejected.map((r) => `• ${r.url} — ${r.reason}`).join("\n")}`;
        }

        return { content: [{ type: "text" as const, text: header + summary + rejectionInfo }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
