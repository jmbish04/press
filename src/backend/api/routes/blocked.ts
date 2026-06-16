/**
 * @fileoverview Blocked-URLs API.
 *
 * Lists URLs the ingestion pipeline detected as bot-blocked / access-denied
 * (no real article), newest first, for the frontend Blocked page.
 */

import { desc } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { blockedUrls } from "../../db/schemas";

export const blockedRouter = new Hono<{ Bindings: Env }>();

/** GET /api/blocked — blocked URLs ordered by date added (desc). */
blockedRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(blockedUrls)
    .orderBy(desc(blockedUrls.createdAt))
    .limit(500);

  return c.json({
    blocked: rows.map((r) => ({
      id: r.id,
      url: r.url,
      reason: r.reason,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
    })),
  });
});
