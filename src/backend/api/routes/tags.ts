/**
 * @fileoverview Tag management API.
 *
 * - `GET    /api/tags`               — list all tags (hierarchical tree).
 * - `POST   /api/tags`               — create a tag (enforces camelCase).
 * - `PUT    /api/tags/:id`           — update name/description/color/active/parent.
 * - `PATCH  /api/tags/:id/active`    — toggle isActive.
 * - `PUT    /api/tags/article/:id`   — replace an article's tag set.
 *
 * Tag names are always normalised to camelCase.
 */

import { eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { getDb } from "../../db";
import { articleTags, tags } from "../../db/schemas";

export const tagsRouter = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert any string to camelCase.
 * "Large Language Models" → "largeLargeModels"
 * "ai agents" → "aiAgents"
 * "AI-Agents" → "aiAgents"
 * Preserves intentional camelCase like "aiAgents".
 */
function toCamelCase(raw: string): string {
  // Split on existing camelCase boundaries so "aiAgents" stays "aiAgents"
  const spaced = String(raw).replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const words = spaced
    .replace(/[^a-zA-Z0-9 ]+/g, " ")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words
    .map((w, i) =>
      i === 0
        ? w.toLowerCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("");
}

/** Normalise a tag name to camelCase. */
function normaliseTagName(name: string): string {
  return toCamelCase(name.trim());
}

/**
 * Derive a child colour in the parent's hue family.
 * Same hue family, stepped lightness by depth + sibling index.
 */
function childColor(parentHue: number, depth: number, siblingIdx: number): string {
  const L = Math.min(0.84, 0.6 + depth * 0.07 + (siblingIdx % 2) * 0.02);
  const h = parentHue + (siblingIdx * 7 - 7);
  return `oklch(${L.toFixed(2)} 0.15 ${h})`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagRow {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  parentId: number | null;
  archived: boolean | null;
  isActive: boolean;
  hue: number | null;
}

interface TagTreeNode extends TagRow {
  articleCount: number;
  children: TagTreeNode[];
  /** Slash-separated path: "AI / Agents / Multimodal" */
  path: string;
}

/** Build a hierarchical tree from a flat list of tags. */
function buildTagTree(rows: TagRow[], counts: Map<number, number>): TagTreeNode[] {
  const nodeMap = new Map<number, TagTreeNode>();

  // Create nodes.
  for (const r of rows) {
    nodeMap.set(r.id, {
      ...r,
      articleCount: counts.get(r.id) ?? 0,
      children: [],
      path: r.name,
    });
  }

  const roots: TagTreeNode[] = [];

  // Wire parent→child.
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children.push(node);
      node.path = `${parent.path} / ${node.name}`;
    } else {
      roots.push(node);
    }
  }

  // Sort children alphabetically.
  const sortChildren = (nodes: TagTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** List all tags as a hierarchical tree. Query `?flat=true` for flat list. */
tagsRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const flat = c.req.query("flat") === "true";
  const activeOnly = c.req.query("activeOnly") === "true";

  let rows = await db.select().from(tags).orderBy(tags.name);

  if (activeOnly) {
    rows = rows.filter((r) => r.isActive);
  }

  // Count articles per tag.
  const countRows = await db
    .select({ tagId: articleTags.tagId })
    .from(articleTags);
  const counts = new Map<number, number>();
  for (const r of countRows) {
    counts.set(r.tagId, (counts.get(r.tagId) ?? 0) + 1);
  }

  if (flat) {
    return c.json({
      tags: rows.map((t) => ({
        ...t,
        articleCount: counts.get(t.id) ?? 0,
      })),
    });
  }

  const tree = buildTagTree(rows, counts);
  return c.json({ tags: tree });
});

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const CreateTagBody = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
  hue: z.number().int().min(0).max(360).optional(),
  parentId: z.number().int().optional(),
});

/** Idempotently create a tag by name. Enforces camelCase. */
tagsRouter.post("/", async (c) => {
  const body = CreateTagBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid body", details: body.error.issues }, 400);
  const db = getDb(c.env);

  const name = normaliseTagName(body.data.name);
  if (!name) return c.json({ error: "Tag name resolves to empty" }, 400);

  // Validate parent exists if provided.
  let parentHue: number | null = null;
  let siblingCount = 0;
  if (body.data.parentId) {
    const parent = await db.select().from(tags).where(eq(tags.id, body.data.parentId)).get();
    if (!parent) return c.json({ error: "Parent tag not found" }, 404);
    parentHue = parent.hue ?? 265;
    // Count siblings under this parent for colour derivation.
    const siblings = await db.select().from(tags).where(eq(tags.parentId, body.data.parentId));
    siblingCount = siblings.length;
  }

  const existing = await db.select().from(tags).where(eq(tags.name, name)).get();
  if (existing) return c.json({ tag: existing });

  // Derive colour: if has parent and no explicit color, use childColor.
  let color = body.data.color;
  let hue = body.data.hue ?? 265;
  if (body.data.parentId && parentHue != null && !color) {
    hue = parentHue;
    const depth = 1; // Direct child
    color = childColor(parentHue, depth, siblingCount);
  } else if (!color) {
    color = `oklch(0.7 0.16 ${hue})`;
  }

  const [tag] = await db
    .insert(tags)
    .values({
      name,
      description: body.data.description ?? null,
      color,
      hue,
      parentId: body.data.parentId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (tag) return c.json({ tag }, 201);

  const after = await db.select().from(tags).where(eq(tags.name, name)).get();
  if (!after) return c.json({ error: "Tag create failed" }, 500);
  return c.json({ tag: after });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const UpdateTagBody = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
  hue: z.number().int().min(0).max(360).optional(),
  parentId: z.number().int().nullable().optional(),
  archived: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** Update a tag — rename, change color/description, set parent, archive, or deactivate. */
tagsRouter.put("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const body = UpdateTagBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid body", details: body.error.issues }, 400);
  const db = getDb(c.env);

  const existing = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) return c.json({ error: "Tag not found" }, 404);

  const updates: Record<string, unknown> = {};

  if (body.data.name !== undefined) {
    updates.name = normaliseTagName(body.data.name);
  }
  if (body.data.description !== undefined) updates.description = body.data.description;
  if (body.data.color !== undefined) updates.color = body.data.color;
  if (body.data.hue !== undefined) updates.hue = body.data.hue;
  if (body.data.archived !== undefined) updates.archived = body.data.archived;
  if (body.data.isActive !== undefined) updates.isActive = body.data.isActive;

  // Handle parentId (allow setting to null to make top-level).
  if (body.data.parentId !== undefined) {
    if (body.data.parentId !== null) {
      // Prevent self-referencing.
      if (body.data.parentId === id) {
        return c.json({ error: "A tag cannot be its own parent" }, 400);
      }
      // Prevent circular references — walk up the ancestor chain.
      let cursor = body.data.parentId;
      const visited = new Set<number>([id]);
      while (cursor) {
        if (visited.has(cursor)) {
          return c.json({ error: "Circular parent reference detected" }, 400);
        }
        visited.add(cursor);
        const ancestor = await db.select({ parentId: tags.parentId }).from(tags).where(eq(tags.id, cursor)).get();
        cursor = ancestor?.parentId ?? 0;
      }
      const parent = await db.select().from(tags).where(eq(tags.id, body.data.parentId)).get();
      if (!parent) return c.json({ error: "Parent tag not found" }, 404);
    }
    updates.parentId = body.data.parentId;
  }

  if (Object.keys(updates).length === 0) return c.json({ tag: existing });

  const [updated] = await db.update(tags).set(updates).where(eq(tags.id, id)).returning();
  return c.json({ tag: updated });
});

// ---------------------------------------------------------------------------
// Toggle active
// ---------------------------------------------------------------------------

/** Convenience: toggle a tag's isActive flag. */
tagsRouter.patch("/:id/active", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const existing = await db.select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) return c.json({ error: "Tag not found" }, 404);

  const [updated] = await db
    .update(tags)
    .set({ isActive: !existing.isActive })
    .where(eq(tags.id, id))
    .returning();

  return c.json({ tag: updated });
});

// ---------------------------------------------------------------------------
// Get children of a tag
// ---------------------------------------------------------------------------

/** Get direct children of a tag (or root-level tags if no id). */
tagsRouter.get("/:id/children", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);
  const db = getDb(c.env);

  const children = await db
    .select()
    .from(tags)
    .where(eq(tags.parentId, id))
    .orderBy(tags.name);

  return c.json({ children });
});

// ---------------------------------------------------------------------------
// Set article tags
// ---------------------------------------------------------------------------

const SetArticleTagsBody = z.object({
  tagIds: z.array(z.number().int()).optional(),
  tagNames: z.array(z.string().trim().min(1).max(64)).optional(),
});

/**
 * Replace an article's tag set. Accepts both `tagIds` (existing) and
 * `tagNames` (creates any new ones on the fly — normalised to Proper Case).
 */
tagsRouter.put("/article/:id", async (c) => {
  const articleId = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(articleId)) return c.json({ error: "Invalid article id" }, 400);

  const body = SetArticleTagsBody.safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Invalid body" }, 400);

  const db = getDb(c.env);
  const idSet = new Set<number>(body.data.tagIds ?? []);

  if (body.data.tagNames && body.data.tagNames.length > 0) {
    // Normalise all names to Proper Case.
    const names = [...new Set(body.data.tagNames.map((n) => normaliseTagName(n)).filter(Boolean))];

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
    .select({ id: tags.id, name: tags.name, color: tags.color, parentId: tags.parentId })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(eq(articleTags.articleId, articleId));

  return c.json({ articleId, tags: final });
});
