/**
 * @fileoverview Sources admin API.
 *
 * - `GET  /api/sources`     — list all sources with article counts.
 * - `PUT  /api/sources/:id` — update a source's style profile.
 */

import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../../db";
import { articles, sources } from "../../db/schemas";

export const sourcesRouter = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/** List all sources with article counts. */
sourcesRouter.get("/", async (c) => {
  const db = getDb(c.env);

  const rows = await db.select().from(sources).orderBy(sources.name);

  // Count articles per source.
  const countRows = await db
    .select({
      sourceId: articles.sourceId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(articles)
    .groupBy(articles.sourceId);

  const countMap = new Map<number, number>();
  for (const r of countRows) {
    if (r.sourceId != null) countMap.set(r.sourceId, r.count);
  }

  return c.json({
    sources: rows.map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      accent: s.accent,
      ink: s.ink,
      bg: s.bg,
      short: s.short,
      face: s.face,
      articleCount: countMap.get(s.id) ?? 0,
    })),
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const UpdateSourceBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  accent: z.string().max(64).optional(),
  ink: z.string().max(16).optional(),
  bg: z.string().max(64).optional(),
  short: z.string().max(10).optional(),
  face: z.enum(["serif", "grotesque", "condensed", "mono", "slab"]).optional(),
});

/** Update a source's style profile. */
sourcesRouter.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const body = UpdateSourceBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success)
    return c.json({ error: "Invalid body", details: body.error.issues }, 400);
  const db = getDb(c.env);

  const existing = await db.select().from(sources).where(eq(sources.id, id)).get();
  if (!existing) return c.json({ error: "Source not found" }, 404);

  const updates: Record<string, unknown> = {};
  if (body.data.name !== undefined) updates.name = body.data.name;
  if (body.data.accent !== undefined) updates.accent = body.data.accent;
  if (body.data.ink !== undefined) updates.ink = body.data.ink;
  if (body.data.bg !== undefined) updates.bg = body.data.bg;
  if (body.data.short !== undefined) updates.short = body.data.short;
  if (body.data.face !== undefined) updates.face = body.data.face;

  if (Object.keys(updates).length === 0) return c.json({ source: existing });

  const [updated] = await db
    .update(sources)
    .set(updates)
    .where(eq(sources.id, id))
    .returning();

  return c.json({ source: updated });
});
