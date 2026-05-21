/**
 * @fileoverview Tags API routes
 *
 * Handles CRUD operations for tags and article-tag associations
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, inArray, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { Bindings, Variables } from "../index";

import * as schema from "../../db/schemas/index";

const tags = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

// List all tags
const listTagsRoute = createRoute({
  method: "get",
  path: "/",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            tags: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                definition: z.string().nullable(),
                hexColor: z.string(),
              }),
            ),
          }),
        },
      },
      description: "List of tags",
    },
  },
});

tags.openapi(listTagsRoute, async (c) => {
  const db = drizzle(c.env.DB, { schema });
  const allTags = await db.select().from(schema.tags).orderBy(desc(schema.tags.name));

  return c.json({ tags: allTags });
});

// Create new tag
const createTagRoute = createRoute({
  method: "post",
  path: "/",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string(),
            definition: z.string().optional(),
            hexColor: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            name: z.string(),
            definition: z.string().nullable(),
            hexColor: z.string(),
          }),
        },
      },
      description: "Tag created",
    },
  },
});

tags.openapi(createTagRoute, async (c) => {
  const { name, definition, hexColor } = c.req.valid("json");
  const db = drizzle(c.env.DB, { schema });

  const [tag] = await db.insert(schema.tags).values({ name, definition, hexColor }).returning();

  return c.json(tag, 201);
});

// Update tag
const updateTagRoute = createRoute({
  method: "put",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            name: z.string().optional(),
            definition: z.string().optional(),
            hexColor: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            name: z.string(),
            definition: z.string().nullable(),
            hexColor: z.string(),
          }),
        },
      },
      description: "Tag updated",
    },
  },
});

tags.openapi(updateTagRoute, async (c) => {
  const { id } = c.req.valid("param");
  const updates = c.req.valid("json");
  const db = drizzle(c.env.DB, { schema });

  const [tag] = await db
    .update(schema.tags)
    .set(updates)
    .where(eq(schema.tags.id, parseInt(id)))
    .returning();

  return c.json(tag);
});

// Delete tag
const deleteTagRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: {
      description: "Tag deleted",
    },
  },
});

tags.openapi(deleteTagRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = drizzle(c.env.DB, { schema });

  // Delete associated article tags first
  await db.delete(schema.articleTags).where(eq(schema.articleTags.tagId, parseInt(id)));

  // Delete the tag
  await db.delete(schema.tags).where(eq(schema.tags.id, parseInt(id)));

  return c.body(null, 204);
});

// Assign tags to article
const assignTagsRoute = createRoute({
  method: "post",
  path: "/assign",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            articleId: z.number(),
            tagIds: z.array(z.number()),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean() }),
        },
      },
      description: "Tags assigned",
    },
  },
});

tags.openapi(assignTagsRoute, async (c) => {
  const { articleId, tagIds } = c.req.valid("json");
  const db = drizzle(c.env.DB, { schema });

  // Remove existing tags for this article
  await db.delete(schema.articleTags).where(eq(schema.articleTags.articleId, articleId));

  // Insert new tag associations
  if (tagIds.length > 0) {
    await db.insert(schema.articleTags).values(tagIds.map((tagId) => ({ articleId, tagId })));
  }

  return c.json({ success: true });
});

// Get tags for an article
const getArticleTagsRoute = createRoute({
  method: "get",
  path: "/article/{articleId}",
  request: {
    params: z.object({ articleId: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            tags: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                definition: z.string().nullable(),
                hexColor: z.string(),
              }),
            ),
          }),
        },
      },
      description: "Article tags",
    },
  },
});

tags.openapi(getArticleTagsRoute, async (c) => {
  const { articleId } = c.req.valid("param");
  const db = drizzle(c.env.DB, { schema });

  const articleTagRows = await db
    .select()
    .from(schema.articleTags)
    .where(eq(schema.articleTags.articleId, parseInt(articleId)));

  if (articleTagRows.length === 0) {
    return c.json({ tags: [] });
  }

  const tagIds = articleTagRows.map((at) => at.tagId);
  const tagsList = await db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds));

  return c.json({ tags: tagsList });
});

export { tags as tagsRouter };
