/**
 * @fileoverview Retrieval-Augmented Generation over the archived article corpus.
 *
 * Embeddings are produced with the same Workers AI model used at ingestion time
 * (so query and document vectors share a space) and routed through AI Gateway.
 */

import { eq, inArray } from "drizzle-orm";

import { getDb } from "../../db";
import { articleProperties, articles, propertyKeys } from "../../db/schemas";
import { embed } from "../gateway";

const EXCERPT_LEN = 1200;

/** A condensed view of an article used to ground agent responses. */
export interface ArticleDigest {
  id: number;
  url: string;
  title: string;
  summary: string;
  excerpt: string;
}

/**
 * Loads articles by ID and joins their AI-extracted metadata into digests.
 * Order follows the supplied `ids` array.
 */
export async function getArticleDigests(env: Env, ids: number[]): Promise<ArticleDigest[]> {
  const unique = [...new Set(ids.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return [];

  const db = getDb(env);

  const rows = await db.select().from(articles).where(inArray(articles.id, unique));

  const props = await db
    .select({
      articleId: articleProperties.articleId,
      key: propertyKeys.key,
      value: articleProperties.value,
    })
    .from(articleProperties)
    .innerJoin(propertyKeys, eq(articleProperties.propertyId, propertyKeys.id))
    .where(inArray(articleProperties.articleId, unique));

  const propsByArticle = new Map<number, Record<string, string>>();
  for (const p of props) {
    const bag = propsByArticle.get(p.articleId) ?? {};
    bag[p.key.toLowerCase()] = p.value;
    propsByArticle.set(p.articleId, bag);
  }

  const byId = new Map(rows.map((r) => [r.id, r]));

  return unique
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((row) => {
      const meta = propsByArticle.get(row.id) ?? {};
      return {
        id: row.id,
        url: row.url,
        title: meta.title ?? meta.topic ?? row.url,
        summary: meta.summary ?? "",
        excerpt: (row.rawContent ?? "").slice(0, EXCERPT_LEN),
      };
    });
}

/** Formats digests into a single grounding context block. */
export function formatDigests(digests: ArticleDigest[]): string {
  return digests
    .map((d) => {
      const head = `[${d.title}] (${d.url})`;
      const body = d.summary ? `Summary: ${d.summary}\n\n${d.excerpt}` : d.excerpt;
      return `${head}\n${body}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Vectorize similarity search, optionally scoped to a set of article IDs.
 *
 * Article IDs are stored as the Vectorize record IDs, so scoping is applied by
 * over-fetching and filtering in memory (no indexed metadata required).
 */
export async function retrieveArticleContext(
  env: Env,
  query: string,
  articleIds: number[] = [],
  topK = 8,
): Promise<string> {
  const digests = await retrieveArticleDigests(env, query, articleIds, topK);
  return formatDigests(digests);
}

/** Like {@link retrieveArticleContext} but returns structured digests. */
export async function retrieveArticleDigests(
  env: Env,
  query: string,
  articleIds: number[] = [],
  topK = 8,
): Promise<ArticleDigest[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const vector = await embed(env, trimmed);
  if (!vector) return [];

  const scoped = articleIds.length > 0;
  const queryK = scoped ? Math.max(topK * 4, 40) : topK;
  const result = await env.VECTORIZE.query(vector, {
    topK: queryK,
    returnMetadata: "all",
  });

  const allowed = new Set(articleIds.map(String));
  const orderedIds = (result.matches ?? [])
    .filter((m) => !scoped || allowed.has(m.id))
    .slice(0, topK)
    .map((m) => Number(m.id))
    .filter((n) => Number.isFinite(n));

  return getArticleDigests(env, orderedIds);
}
