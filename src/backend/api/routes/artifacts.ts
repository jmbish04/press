/**
 * @fileoverview Spawned-artifact API.
 *
 * - `artifactsRouter` lists artifact records from D1 (`/api/artifacts`).
 *   Supports filtering by type, articleId, and session. Includes new
 *   provenance fields (prompt, sourceArticleIds, version, parentArtifactId).
 * - `artifactAssetsRouter` streams the deployed HTML/JSON from R2 (`/artifacts/*`).
 */

import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { spawnedArtifacts } from "../../db/schemas";

/** JSON listing of spawned artifacts with optional filters. */
export const artifactsRouter = new Hono<{ Bindings: Env }>();

/** GET /api/artifacts — list all artifacts with optional filters. */
artifactsRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const sessionId = c.req.query("sessionId");
  const type = c.req.query("type"); // "mindmap" | "pwa" | "summary-card"
  const articleId = c.req.query("articleId");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);

  const conditions = [];
  if (sessionId) conditions.push(eq(spawnedArtifacts.sessionId, sessionId));
  if (type) conditions.push(eq(spawnedArtifacts.type, type as "pwa" | "mindmap" | "summary-card"));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(spawnedArtifacts)
    .where(whereClause)
    .orderBy(desc(spawnedArtifacts.createdAt))
    .limit(limit);

  // If articleId filter is set, further filter by sourceArticleIds JSON array.
  let filtered = rows;
  if (articleId) {
    filtered = rows.filter((r) => {
      try {
        const ids = JSON.parse(r.sourceArticleIds ?? r.articleIds);
        return Array.isArray(ids) && ids.includes(Number(articleId));
      } catch {
        return false;
      }
    });
  }

  return c.json({
    artifacts: filtered.map((r) => ({
      id: r.id,
      sessionId: r.sessionId,
      type: r.type,
      title: r.title,
      r2Key: r.r2Key,
      publicUrl: r.publicUrl,
      articleIds: r.articleIds,
      prompt: r.prompt,
      sourceArticleIds: r.sourceArticleIds,
      version: r.version,
      parentArtifactId: r.parentArtifactId,
      createdAt: r.createdAt?.toISOString() ?? null,
    })),
  });
});

/** GET /api/artifacts/:id — single artifact with full metadata. */
artifactsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const [artifact] = await db
    .select()
    .from(spawnedArtifacts)
    .where(eq(spawnedArtifacts.id, id))
    .limit(1);

  if (!artifact) return c.json({ error: "Artifact not found" }, 404);

  return c.json({
    ...artifact,
    createdAt: artifact.createdAt?.toISOString() ?? null,
  });
});

/** GET /api/artifacts/:id/versions — list all versions of a PWA artifact. */
artifactsRouter.get("/:id/versions", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  // Walk the version chain: find all artifacts sharing the same root.
  const [root] = await db
    .select()
    .from(spawnedArtifacts)
    .where(eq(spawnedArtifacts.id, id))
    .limit(1);

  if (!root) return c.json({ error: "Artifact not found" }, 404);

  // Find all artifacts that share the same title and type (simple version chain).
  const versions = await db
    .select()
    .from(spawnedArtifacts)
    .where(
      and(
        eq(spawnedArtifacts.type, root.type),
        eq(spawnedArtifacts.title, root.title),
      ),
    )
    .orderBy(desc(spawnedArtifacts.createdAt));

  return c.json({
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      prompt: v.prompt,
      parentArtifactId: v.parentArtifactId,
      publicUrl: v.publicUrl,
      createdAt: v.createdAt?.toISOString() ?? null,
    })),
  });
});

/** Serves a deployed artifact's HTML/JSON straight from the SPAWNED_PWAS bucket. */
export const artifactAssetsRouter = new Hono<{ Bindings: Env }>();

artifactAssetsRouter.get("/*", async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/artifacts\//, ""));
  if (!key) return c.notFound();

  const object = await c.env.SPAWNED_PWAS.get(key);
  if (!object) return c.notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});
