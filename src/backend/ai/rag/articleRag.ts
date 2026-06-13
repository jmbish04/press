/**
 * @fileoverview Retrieval-Augmented Generation over the archived article corpus.
 *
 * Embeddings are produced with the same Workers AI model used at ingestion time
 * (so query and document vectors share a space) and routed through AI Gateway.
 *
 * Supports both legacy single-vector (ID = "{articleId}") and new chunked
 * vectors (ID = "{articleId}-chunk-{N}" with metadata.articleId).
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
      // Prefer clean content for the excerpt (better quality for RAG grounding).
      const content = row.cleanContent || row.rawContent || "";
      return {
        id: row.id,
        url: row.url,
        title: meta.title ?? meta.topic ?? row.url,
        summary: meta.summary ?? "",
        excerpt: content.slice(0, EXCERPT_LEN),
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
 * Extract article ID from a Vectorize match.
 *
 * Supports both legacy format (ID = "123") and chunked format
 * (ID = "123-chunk-0", metadata.articleId = 123).
 */
function extractArticleId(match: { id: string; metadata?: Record<string, unknown> | null }): number {
  // Chunked format: check metadata first.
  if (match.metadata?.articleId) {
    const metaId = Number(match.metadata.articleId);
    if (Number.isFinite(metaId)) return metaId;
  }

  // Legacy format or direct ID.
  const directId = Number(match.id);
  if (Number.isFinite(directId)) return directId;

  // Chunked format: parse from "{articleId}-chunk-{N}".
  const chunkMatch = match.id.match(/^(\d+)-chunk-\d+$/);
  if (chunkMatch) {
    const parsed = Number(chunkMatch[1]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return NaN;
}

/**
 * Vectorize similarity search, optionally scoped to a set of article IDs.
 *
 * Article IDs are now extracted from vector metadata (chunked format) or
 * parsed from the vector ID (legacy format). Deduplication ensures each
 * article appears at most once in the results.
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
  // Over-fetch for scoped queries (multiple chunks per article) and for dedup.
  const queryK = scoped ? Math.max(topK * 6, 60) : Math.max(topK * 3, 30);
  const result = await env.VECTORIZE.query(vector, {
    topK: queryK,
    returnMetadata: "all",
  });

  const allowed = new Set(articleIds);

  // Extract article IDs, deduplicate, and respect scope.
  const seen = new Set<number>();
  const orderedIds: number[] = [];

  for (const m of result.matches ?? []) {
    const artId = extractArticleId(m);
    if (!Number.isFinite(artId)) continue;
    if (scoped && !allowed.has(artId)) continue;
    if (seen.has(artId)) continue;

    seen.add(artId);
    orderedIds.push(artId);

    if (orderedIds.length >= topK) break;
  }

  return getArticleDigests(env, orderedIds);
}
