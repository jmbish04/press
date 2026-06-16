/**
 * @fileoverview Cloudflare Workers entry point.
 *
 * This wrapper is the deployed worker (`main` in wrangler.jsonc). It exists so
 * the Durable Object classes can be exported from the entrypoint — the Astro
 * adapter's generated worker cannot export them itself.
 *
 * Request priority:
 *   1. Agent traffic (WebSocket + HTTP) via `routeAgentRequest`
 *   2. MCP server at `/mcp` via `PressMcpAgent.serve()`
 *   3. Hono API (`/api/*`, docs, artifact serving)
 *   4. Astro SSR (pages + static assets) via the generated worker
 */

import { routeAgentRequest } from "agents";

// Built by `astro build`; always present before `wrangler deploy` runs.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated output, absent during type-checking
import astroWorker from "../dist/_worker.js/index.js";
import { PressMcpAgent } from "./backend/ai/agents/pressMcp";
import { app as honoApp } from "./backend/api/index";

// Durable Object classes must be exported from the worker entry point.
export { NewsAgent } from "./backend/ai/agents/newsAgent";
export { ArticleChatAgent } from "./backend/ai/agents/articleChat";
export { IngestAgent } from "./backend/ai/agents/ingestAgent";
export { ProcessingMonitor } from "./backend/ai/agents/processingMonitor";
export { PressMcpAgent } from "./backend/ai/agents/pressMcp";

// Workflows must also be exported from the entry point.
export { ArticleIngestionWorkflow } from "./backend/workflows/ArticleIngestionWorkflow";

const astro = astroWorker as ExportedHandler<Env>;

/** MCP server handler — Streamable HTTP with SSE fallback. */
const mcpHandler = PressMcpAgent.serve("/mcp", { binding: "PRESS_MCP" });

const API_PREFIXES = ["/api/", "/artifacts/"];
const API_EXACT = new Set(["/openapi.json", "/swagger", "/scalar", "/docs", "/health", "/context"]);

export default {
  async fetch(request, env, ctx) {
    // Agent WebSocket / HTTP routing takes priority.
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    const { pathname } = new URL(request.url);

    // MCP server at /mcp (Streamable HTTP + SSE transport).
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      return mcpHandler.fetch(request, env, ctx);
    }

    if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || API_EXACT.has(pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    // Astro's generated worker handles SSR pages and static assets.
    return astro.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
