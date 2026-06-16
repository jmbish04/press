/**
 * @fileoverview API-key authentication backed by the Secrets Store.
 *
 * Compares the caller's key against the `WORKER_API_KEY` secret resolved at
 * request time via `env.WORKER_API_KEY.get()`. Used for programmatic endpoints
 * (ingestion) that are not driven by an interactive user session.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

/** Cookie the interactive UI stores the access key in (same-origin). */
export const API_KEY_COOKIE = "press_api_key";

/**
 * Reads the API key from `Authorization: Bearer <key>`, the `X-API-Key`
 * header, or the same-origin `press_api_key` cookie (set by the UI's access
 * modal). Headers take precedence so external/programmatic callers are
 * unaffected.
 */
function readKey(c: Context<{ Bindings: Env }>): string | undefined {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  const xKey = c.req.header("X-API-Key")?.trim();
  if (xKey) return xKey;
  return getCookie(c, API_KEY_COOKIE)?.trim();
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
