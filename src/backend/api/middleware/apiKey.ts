/**
 * @fileoverview API-key authentication backed by the Secrets Store.
 *
 * Compares the caller's key against the `WORKER_API_KEY` secret resolved at
 * request time via `env.WORKER_API_KEY.get()`. Used for programmatic endpoints
 * (ingestion) that are not driven by an interactive user session.
 */

import type { Context, Next } from "hono";

/** Reads the API key from `Authorization: Bearer <key>` or `X-API-Key`. */
function readKey(c: Context<{ Bindings: Env }>): string | undefined {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return c.req.header("X-API-Key")?.trim();
}

/** Rejects requests whose API key does not match the stored `WORKER_API_KEY`. */
export async function apiKeyMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const provided = readKey(c);
  if (!provided) {
    return c.json({ error: "Missing API key" }, 401);
  }

  let expected: string;
  try {
    expected = await c.env.WORKER_API_KEY.get();
  } catch (err) {
    console.error("Failed to read WORKER_API_KEY from the Secrets Store", err);
    return c.json({ error: "Authentication is not configured" }, 500);
  }

  if (!expected || provided !== expected) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  await next();
}
