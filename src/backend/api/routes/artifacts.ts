/**
 * @fileoverview Spawned-artifact API.
 *
 * - `artifactsRouter` lists artifact records from D1 (`/api/artifacts`).
 * - `artifactAssetsRouter` streams the deployed HTML from R2 (`/artifacts/*`).
 */

import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { spawnedArtifacts } from "../../db/schemas";

/** JSON listing of spawned artifacts, optionally scoped to a session. */
export const artifactsRouter = new Hono<{ Bindings: Env }>();

artifactsRouter.get("/", async (c) => {
  const db = getDb(c.env);
  const sessionId = c.req.query("sessionId");
  const rows = await db
    .select()
    .from(spawnedArtifacts)
    .where(sessionId ? eq(spawnedArtifacts.sessionId, sessionId) : undefined)
    .orderBy(desc(spawnedArtifacts.createdAt));
  return c.json(rows);
});

/** Serves a deployed artifact's HTML straight from the SPAWNED_PWAS bucket. */
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
