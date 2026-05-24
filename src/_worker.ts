/**
 * @fileoverview Cloudflare Workers entry point.
 *
 * This wrapper is the deployed worker (`main` in wrangler.jsonc). It exists so
 * the Durable Object classes can be exported from the entrypoint — the Astro
 * adapter's generated worker cannot export them itself.
 *
 * Request priority:
 *   1. Agent traffic (WebSocket + HTTP) via `routeAgentRequest`
 *   2. Hono API (`/api/*`, docs, artifact serving)
 *   3. Astro SSR (pages + static assets) via the generated worker
 */

import { routeAgentRequest } from "agents";

// Built by `astro build`; always present before `wrangler deploy` runs.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated output, absent during type-checking
import astroWorker from "../dist/_worker.js/index.js";
import { app as honoApp } from "./backend/api/index";

// Durable Object classes must be exported from the worker entry point.
export { NewsAgent } from "./backend/ai/agents/newsAgent";
export { ArticleChatAgent } from "./backend/ai/agents/articleChat";
export { IngestAgent } from "./backend/ai/agents/ingestAgent";

const astro = astroWorker as ExportedHandler<Env>;

const API_PREFIXES = ["/api/", "/artifacts/"];
const API_EXACT = new Set(["/openapi.json", "/swagger", "/scalar", "/docs", "/health", "/context"]);

export default {
  async fetch(request, env, ctx) {
    // Agent WebSocket / HTTP routing takes priority.
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    const { pathname } = new URL(request.url);
    if (API_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || API_EXACT.has(pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    // Astro's generated worker handles SSR pages and static assets.
    return astro.fetch!(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
