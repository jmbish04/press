/**
 * @fileoverview Tag management API.
 *
 * - `GET  /api/tags`                  — list all tags.
 * - `POST /api/tags`                  — create / upsert a tag by name.
 * - `PUT  /api/tags/article/:id`      — replace an article's tag set
 *                                       (accepts ids and/or names; names that
 *                                        don't exist are created on the fly).
 */

import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../../db";
import { articleTags, tags } from "../../db/schemas";

export const tagsRouter = new Hono<{ Bindings: Env }>();

/** List every tag, alphabetical. */
tagsRouter.get("/", async (c) => {
  const rows = await getDb(c.env).select().from(tags).orderBy(tags.name);
  return c.json({ tags: rows });
});

const CreateTagBody = z.object({ name: z.string().trim().min(1).max(64) });

/** Idempotently create a tag by name. */
tagsRouter.post("/", async (c) => {
  const body = CreateTagBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid name" }, 400);
  const db = getDb(c.env);

  const existing = await db.select().from(tags).where(eq(tags.name, body.data.name)).get();
  if (existing) return c.json({ tag: existing });

  const [tag] = await db
    .insert(tags)
    .values({ name: body.data.name })
    .onConflictDoNothing()
    .returning();
  if (tag) return c.json({ tag }, 201);

  const after = await db.select().from(tags).where(eq(tags.name, body.data.name)).get();
  if (!after) return c.json({ error: "Tag create failed" }, 500);
  return c.json({ tag: after });
});

const SetArticleTagsBody = z.object({
  tagIds: z.array(z.number().int()).optional(),
  tagNames: z.array(z.string().trim().min(1).max(64)).optional(),
});

/**
 * Replace an article's tag set. Accepts both `tagIds` (existing) and
 * `tagNames` (creates any new ones on the fly).
 */
tagsRouter.put("/article/:id", async (c) => {
  const articleId = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(articleId)) return c.json({ error: "Invalid article id" }, 400);

  const body = SetArticleTagsBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid body" }, 400);

  const db = getDb(c.env);
  const idSet = new Set<number>(body.data.tagIds ?? []);

  if (body.data.tagNames && body.data.tagNames.length > 0) {
    const names = [...new Set(body.data.tagNames.map((n) => n.trim()).filter(Boolean))];

    const existing = await db.select().from(tags).where(inArray(tags.name, names));
    for (const t of existing) idSet.add(t.id);

    const missing = names.filter((n) => !existing.some((e) => e.name === n));
    if (missing.length > 0) {
      const created = await db
        .insert(tags)
        .values(missing.map((name) => ({ name })))
        .onConflictDoNothing()
        .returning();
      for (const t of created) idSet.add(t.id);

      // Any names that lost the insert race are now present; pick them up.
      const stillMissing = missing.filter((n) => !created.some((c2) => c2.name === n));
      if (stillMissing.length > 0) {
        const refetched = await db.select().from(tags).where(inArray(tags.name, stillMissing));
        for (const t of refetched) idSet.add(t.id);
      }
    }
  }

  const targetTagIds = [...idSet];

  // Replace the article's tag set.
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (targetTagIds.length > 0) {
    await db
      .insert(articleTags)
      .values(targetTagIds.map((tagId) => ({ articleId, tagId })))
      .onConflictDoNothing();
  }

  const final = await db
    .select({ id: tags.id, name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId));

  return c.json({ articleId, tags: final });
});
