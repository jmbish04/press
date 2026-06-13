/**
 * @fileoverview Application preferences API.
 *
 * Key-value store for system-wide settings (narration voice, AI provider, etc.).
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { preferences } from "../../db/schemas";

export const preferencesRouter = new Hono<{ Bindings: Env }>();

/** GET /api/preferences — list all preferences as a key-value map. */
preferencesRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(preferences);

  const map: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      map[row.key] = JSON.parse(row.value);
    } catch {
      map[row.key] = row.value;
    }
  }

  return c.json({ preferences: map });
});

/** PUT /api/preferences/:key — set a preference value. */
preferencesRouter.put("/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{ value: unknown }>();
  const db = getDb(c.env);

  const serialized = typeof body.value === "string" ? body.value : JSON.stringify(body.value);

  await db
    .insert(preferences)
    .values({ key, value: serialized })
    .onConflictDoUpdate({
      target: preferences.key,
      set: { value: serialized, updatedAt: new Date() },
    });

  return c.json({ status: "saved" });
});
