/**
 * @fileoverview Articles API routes
 *
 * Handles article retrieval, filtering, and search operations
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, inArray, like, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import type { Bindings, Variables } from "../index";

import * as schema from "../../db/schemas/index";

const articles = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

// List articles with optional filtering
const listArticlesRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: z.object({
      tagIds: z.string().optional(),
      search: z.string().optional(),
      limit: z.string().optional(),
      offset: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            articles: z.array(
              z.object({
                id: z.number(),
                url: z.string(),
                rawContent: z.string().nullable(),
                screenshotUrl: z.string().nullable(),
                createdAt: z.number(),
                tags: z.array(
                  z.object({
                    id: z.number(),
                    name: z.string(),
                    hexColor: z.string(),
                  }),
                ),
                properties: z.record(z.string()),
              }),
            ),
            total: z.number(),
          }),
        },
      },
      description: "List of articles",
    },
  },
});

articles.openapi(listArticlesRoute, async (c) => {
  const { tagIds, search, limit, offset } = c.req.valid("query");
  const db = drizzle(c.env.DB, { schema });

  const limitNum = limit ? parseInt(limit) : 50;
  const offsetNum = offset ? parseInt(offset) : 0;

  let articleIds: number[] | undefined;

  // Filter by tags if specified
  if (tagIds) {
    const tagIdArray = tagIds.split(",").map((id) => parseInt(id));
    const articleTagRows = await db
      .select()
      .from(schema.articleTags)
      .where(inArray(schema.articleTags.tagId, tagIdArray));

    articleIds = [...new Set(articleTagRows.map((at) => at.articleId))];

    if (articleIds.length === 0) {
      return c.json({ articles: [], total: 0 });
    }
  }

  // Build query
  let query = db.select().from(schema.articles);

  if (articleIds) {
    query = query.where(inArray(schema.articles.id, articleIds));
  }

  if (search) {
    query = query.where(like(schema.articles.rawContent, `%${search}%`));
  }

  const allArticles = await query.orderBy(desc(schema.articles.createdAt));

  // Paginate
  const paginatedArticles = allArticles.slice(offsetNum, offsetNum + limitNum);

  // Fetch tags and properties for each article
  const enrichedArticles = await Promise.all(
    paginatedArticles.map(async (article) => {
      // Get tags
      const articleTagRows = await db
        .select()
        .from(schema.articleTags)
        .where(eq(schema.articleTags.articleId, article.id));

      let tags = [];
      if (articleTagRows.length > 0) {
        const tagIds = articleTagRows.map((at) => at.tagId);
        tags = await db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds));
      }

      // Get properties
      const propertyRows = await db
        .select()
        .from(schema.articleProperties)
        .where(eq(schema.articleProperties.articleId, article.id));

      const properties: Record<string, string> = {};
      if (propertyRows.length > 0) {
        const propKeyIds = propertyRows.map((p) => p.propertyId);
        const propertyKeys = await db
          .select()
          .from(schema.propertyKeys)
          .where(inArray(schema.propertyKeys.id, propKeyIds));

        const keyMap = new Map(propertyKeys.map((k) => [k.id, k.key]));
        propertyRows.forEach((p) => {
          const key = keyMap.get(p.propertyId);
          if (key) {
            properties[key] = p.value;
          }
        });
      }

      return {
        ...article,
        createdAt: article.createdAt ? article.createdAt.getTime() : Date.now(),
        tags,
        properties,
      };
    }),
  );

  return c.json({ articles: enrichedArticles, total: allArticles.length });
});

// Get single article by ID
const getArticleRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.number(),
            url: z.string(),
            rawContent: z.string().nullable(),
            screenshotUrl: z.string().nullable(),
            createdAt: z.number(),
            tags: z.array(
              z.object({
                id: z.number(),
                name: z.string(),
                definition: z.string().nullable(),
                hexColor: z.string(),
              }),
            ),
            properties: z.record(z.string()),
          }),
        },
      },
      description: "Article details",
    },
  },
});

articles.openapi(getArticleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = drizzle(c.env.DB, { schema });

  const [article] = await db
    .select()
    .from(schema.articles)
    .where(eq(schema.articles.id, parseInt(id)));

  if (!article) {
    return c.json({ error: "Article not found" }, 404);
  }

  // Get tags
  const articleTagRows = await db
    .select()
    .from(schema.articleTags)
    .where(eq(schema.articleTags.articleId, article.id));

  let tags = [];
  if (articleTagRows.length > 0) {
    const tagIds = articleTagRows.map((at) => at.tagId);
    tags = await db.select().from(schema.tags).where(inArray(schema.tags.id, tagIds));
  }

  // Get properties
  const propertyRows = await db
    .select()
    .from(schema.articleProperties)
    .where(eq(schema.articleProperties.articleId, article.id));

  const properties: Record<string, string> = {};
  if (propertyRows.length > 0) {
    const propKeyIds = propertyRows.map((p) => p.propertyId);
    const propertyKeys = await db
      .select()
      .from(schema.propertyKeys)
      .where(inArray(schema.propertyKeys.id, propKeyIds));

    const keyMap = new Map(propertyKeys.map((k) => [k.id, k.key]));
    propertyRows.forEach((p) => {
      const key = keyMap.get(p.propertyId);
      if (key) {
        properties[key] = p.value;
      }
    });
  }

  return c.json({
    ...article,
    createdAt: article.createdAt ? article.createdAt.getTime() : Date.now(),
    tags,
    properties,
  });
});

// Delete article
const deleteArticleRoute = createRoute({
  method: "delete",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: {
      description: "Article deleted",
    },
  },
});

articles.openapi(deleteArticleRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = drizzle(c.env.DB, { schema });

  const articleId = parseInt(id);

  // Delete related records
  await db.delete(schema.articleTags).where(eq(schema.articleTags.articleId, articleId));
  await db
    .delete(schema.articleProperties)
    .where(eq(schema.articleProperties.articleId, articleId));

  // Delete the article
  await db.delete(schema.articles).where(eq(schema.articles.id, articleId));

  // TODO: Delete from vectorize index

  return c.body(null, 204);
});

export { articles as articlesRouter };
