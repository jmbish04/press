/**
 * @fileoverview MCP tools: list_articles, get_article
 *
 * Browse and retrieve articles from the D1 archive with their AI-extracted
 * properties and tags.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../../../db";
import {
  articleProperties,
  articleTags,
  articles,
  propertyKeys,
  tags,
} from "../../../../db/schemas";

/** Loads property key/value pairs for a set of article IDs. */
async function loadProperties(
  env: Env,
  ids: number[],
): Promise<Map<number, Record<string, string>>> {
  if (ids.length === 0) return new Map();
  const db = getDb(env);
  const rows = await db
    .select({
      articleId: articleProperties.articleId,
      key: propertyKeys.key,
      value: articleProperties.value,
    })
    .from(articleProperties)
    .innerJoin(propertyKeys, eq(articleProperties.propertyId, propertyKeys.id))
    .where(inArray(articleProperties.articleId, ids));

  const map = new Map<number, Record<string, string>>();
  for (const r of rows) {
    const bag = map.get(r.articleId) ?? {};
    bag[r.key.toLowerCase()] = r.value;
    map.set(r.articleId, bag);
  }
  return map;
}

/** Loads tags for a set of article IDs. */
async function loadTags(env: Env, ids: number[]): Promise<Map<number, string[]>> {
  if (ids.length === 0) return new Map();
  const db = getDb(env);
  const rows = await db
    .select({ articleId: articleTags.articleId, name: tags.name })
    .from(articleTags)
    .innerJoin(tags, eq(articleTags.tagId, tags.id))
    .where(inArray(articleTags.articleId, ids));

  const map = new Map<number, string[]>();
  for (const r of rows) {
    const list = map.get(r.articleId) ?? [];
    list.push(r.name);
    map.set(r.articleId, list);
  }
  return map;
}

export function registerBrowseArticlesTools(server: McpServer, env: Env): void {
  // ── list_articles ──────────────────────────────────────────────────────
  server.tool(
    "list_articles",
    "List archived articles with their AI-extracted metadata (title, summary, topic, source, author) and tags. Ordered by newest first.",
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of articles to return (default: 20)"),
      category: z.string().optional().describe("Filter by topic/category (case-insensitive)"),
    } as any,
    async (args: any) => {
      const { limit, category } = args;
      try {
        const db = getDb(env);
        const rows = await db
          .select({ id: articles.id, url: articles.url, createdAt: articles.createdAt })
          .from(articles)
          .orderBy(desc(articles.createdAt))
          .limit(limit ?? 20);

        if (rows.length === 0) {
          return { content: [{ type: "text" as const, text: "The archive is empty." }] };
        }

        const ids = rows.map((r) => r.id);
        const [propsMap, tagsMap] = await Promise.all([
          loadProperties(env, ids),
          loadTags(env, ids),
        ]);

        let items = rows.map((r) => {
          const props = propsMap.get(r.id) ?? {};
          return {
            id: r.id,
            url: r.url,
            title: props.title ?? props.topic ?? r.url,
            summary: props.summary ?? "",
            topic: props.topic ?? "",
            source: props.source ?? "",
            author: props.author ?? "",
            tags: tagsMap.get(r.id) ?? [],
            createdAt: r.createdAt ? r.createdAt.toISOString() : null,
          };
        });

        if (category) {
          const needle = category.toLowerCase();
          items = items.filter((it) => it.topic.toLowerCase() === needle);
        }

        const formatted = items
          .map((it) => {
            const parts = [`**${it.title}** (ID: ${it.id})`, `  URL: ${it.url}`];
            if (it.summary) parts.push(`  Summary: ${it.summary}`);
            if (it.topic) parts.push(`  Topic: ${it.topic}`);
            if (it.source) parts.push(`  Source: ${it.source}`);
            if (it.author) parts.push(`  Author: ${it.author}`);
            if (it.tags.length > 0) parts.push(`  Tags: ${it.tags.join(", ")}`);
            if (it.createdAt) parts.push(`  Archived: ${it.createdAt}`);
            return parts.join("\n");
          })
          .join("\n\n");

        return {
          content: [{ type: "text" as const, text: `${items.length} article(s):\n\n${formatted}` }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to list articles: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // ── get_article ────────────────────────────────────────────────────────
  server.tool(
    "get_article",
    "Get full article detail by ID, including raw text content, AI-extracted properties, and tags.",
    { id: z.number().int().positive().describe("Article ID") } as any,
    async (args: any) => {
      const { id } = args;
      try {
        const db = getDb(env);
        const row = await db.select().from(articles).where(eq(articles.id, id)).get();
        if (!row) {
          return {
            content: [{ type: "text" as const, text: `Article ${id} not found.` }],
            isError: true,
          };
        }

        const [propsMap, tagsMap] = await Promise.all([
          loadProperties(env, [id]),
          loadTags(env, [id]),
        ]);
        const props = propsMap.get(id) ?? {};
        const tagList = tagsMap.get(id) ?? [];

        const parts = [
          `# ${props.title ?? props.topic ?? row.url}`,
          `**URL:** ${row.url}`,
          `**ID:** ${row.id}`,
        ];
        if (props.source) parts.push(`**Source:** ${props.source}`);
        if (props.author) parts.push(`**Author:** ${props.author}`);
        if (props.topic) parts.push(`**Topic:** ${props.topic}`);
        if (props.summary) parts.push(`**Summary:** ${props.summary}`);
        if (tagList.length > 0) parts.push(`**Tags:** ${tagList.join(", ")}`);
        if (row.createdAt) parts.push(`**Archived:** ${row.createdAt.toISOString()}`);
        if (row.rawContent) parts.push(`\n---\n\n${row.rawContent}`);

        return { content: [{ type: "text" as const, text: parts.join("\n") }] };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to get article: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
