/**
 * @fileoverview Saved views CRUD API.
 *
 * Saved views are reusable filter presets for the Newsstand. Each view
 * stores include/exclude facets as JSON so the frontend can reconstruct
 * the filter state.
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { savedViews } from "../../db/schemas";

export const viewsRouter = new Hono<{ Bindings: Env }>();

/** GET /api/views — list all active saved views. */
viewsRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(savedViews)
    .where(eq(savedViews.deleted, false));

  return c.json({
    views: rows.map((v) => ({
      ...v,
      createdAt: v.createdAt?.toISOString() ?? null,
      updatedAt: v.updatedAt?.toISOString() ?? null,
    })),
  });
});

/** POST /api/views — create a new saved view. */
viewsRouter.post("/", async (c) => {
  const body = await c.req.json<{
    name: string;
    hue?: number;
    includeFacets: string;
    excludeFacets: string;
  }>();

  const db = getDb(c.env);
  const id = crypto.randomUUID();

  const [view] = await db
    .insert(savedViews)
    .values({
      id,
      name: body.name,
      hue: body.hue ?? 200,
      includeFacets: body.includeFacets,
      excludeFacets: body.excludeFacets,
    })
    .returning();

  return c.json(
    {
      ...view,
      createdAt: view.createdAt?.toISOString() ?? null,
      updatedAt: view.updatedAt?.toISOString() ?? null,
    },
    201,
  );
});

/** DELETE /api/views/:id — soft-delete a saved view. */
viewsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const [existing] = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
  if (!existing) return c.json({ error: "View not found" }, 404);

  await db.update(savedViews).set({ deleted: true }).where(eq(savedViews.id, id));
  return c.json({ status: "deleted" });
});

/** PUT /api/views/:id — update a saved view. */
viewsRouter.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    hue?: number;
    includeFacets?: string;
    excludeFacets?: string;
    deleted?: boolean;
  }>();

  const db = getDb(c.env);
  const [existing] = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
  if (!existing) return c.json({ error: "View not found" }, 404);

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.hue !== undefined) updates.hue = body.hue;
  if (body.includeFacets !== undefined) updates.includeFacets = body.includeFacets;
  if (body.excludeFacets !== undefined) updates.excludeFacets = body.excludeFacets;
  if (body.deleted !== undefined) updates.deleted = body.deleted;
  updates.updatedAt = new Date();

  const [updated] = await db.update(savedViews).set(updates).where(eq(savedViews.id, id)).returning();
  return c.json({
    ...updated,
    createdAt: updated.createdAt?.toISOString() ?? null,
    updatedAt: updated.updatedAt?.toISOString() ?? null,
  });
});
