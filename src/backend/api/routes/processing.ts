/**
 * @fileoverview Processing pipeline monitoring API.
 *
 * Exposes CRUD for `ingestion_jobs` so the Processing frontend page can
 * show real-time pipeline status with retry / discard actions.
 */

import { desc, eq, sql, and, lt, inArray } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { ingestionJobs } from "../../db/schemas";

export const processingRouter = new Hono<{ Bindings: Env }>();

/**
 * Threshold (in ms) after which an "active" job with no updates is
 * considered stale and should be marked as errored.
 */
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** GET /api/processing/jobs — list jobs, newest first. ?state= filter. */
processingRouter.get("/jobs", async (c) => {
  const state = c.req.query("state");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const db = getDb(c.env);

  const conditions = state ? and(eq(ingestionJobs.state, state)) : undefined;

  const jobs = await db
    .select()
    .from(ingestionJobs)
    .where(conditions)
    .orderBy(desc(ingestionJobs.createdAt))
    .limit(limit);

  return c.json({
    jobs: jobs.map((j) => ({
      ...j,
      createdAt: j.createdAt?.toISOString() ?? null,
      updatedAt: j.updatedAt?.toISOString() ?? null,
    })),
  });
});

/** GET /api/processing/stats — aggregate counts by job state. */
processingRouter.get("/stats", async (c) => {
  const db = getDb(c.env);

  const rows = await db
    .select({
      state: ingestionJobs.state,
      count: sql<number>`count(*)`,
    })
    .from(ingestionJobs)
    .groupBy(ingestionJobs.state);

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.state ?? "active"] = r.count;

  return c.json({
    active: counts.active ?? 0,
    done: counts.done ?? 0,
    err: counts.err ?? 0,
    discarded: counts.discarded ?? 0,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  });
});

/** POST /api/processing/jobs/:id/retry — re-create a workflow for a failed job. */
processingRouter.post("/jobs/:id/retry", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const [job] = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, id)).limit(1);
  if (!job) return c.json({ error: "Job not found" }, 404);

  const newJobId = crypto.randomUUID();
  await db.insert(ingestionJobs).values({
    id: newJobId,
    url: job.url,
    source: job.source,
    state: "active",
    stage: 0,
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c.env as any).ARTICLE_INGESTION.create({
      id: newJobId,
      params: { jobId: newJobId, url: job.url, source: job.source ?? undefined },
    });
  } catch (err) {
    console.error(`Retry workflow creation failed for ${job.url}:`, err);
  }

  return c.json({ status: "retrying", jobId: newJobId });
});

/** POST /api/processing/jobs/:id/discard — mark a job as discarded. */
processingRouter.post("/jobs/:id/discard", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);

  const [job] = await db.select().from(ingestionJobs).where(eq(ingestionJobs.id, id)).limit(1);
  if (!job) return c.json({ error: "Job not found" }, 404);

  await db
    .update(ingestionJobs)
    .set({ state: "discarded", updatedAt: new Date() })
    .where(eq(ingestionJobs.id, id));

  return c.json({ status: "discarded" });
});

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

/**
 * POST /api/processing/cleanup-stale
 *
 * Marks all "active" jobs that haven't been updated in over 1 hour as errors.
 * These are jobs whose workflow either silently crashed or never started.
 */
processingRouter.post("/cleanup-stale", async (c) => {
  const db = getDb(c.env);
  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);

  const staleJobs = await db
    .select({ id: ingestionJobs.id, url: ingestionJobs.url })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.state, "active"),
        lt(ingestionJobs.updatedAt, cutoff),
      ),
    );

  if (staleJobs.length === 0) {
    return c.json({ cleaned: 0, message: "No stale jobs found" });
  }

  const staleIds = staleJobs.map((j) => j.id);

  await db
    .update(ingestionJobs)
    .set({
      state: "err",
      error: "Stale: workflow never completed (auto-cleaned)",
      updatedAt: new Date(),
    })
    .where(inArray(ingestionJobs.id, staleIds));

  return c.json({
    cleaned: staleIds.length,
    message: `Marked ${staleIds.length} stale active job(s) as errors`,
  });
});

/**
 * POST /api/processing/bulk-error-active
 *
 * Force-marks ALL currently "active" jobs as errors. Use when you know
 * no workflows are genuinely running and the active count is stale.
 */
processingRouter.post("/bulk-error-active", async (c) => {
  const db = getDb(c.env);

  const activeJobs = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.state, "active"));

  if (activeJobs.length === 0) {
    return c.json({ updated: 0, message: "No active jobs to mark" });
  }

  const ids = activeJobs.map((j) => j.id);

  await db
    .update(ingestionJobs)
    .set({
      state: "err",
      error: "Manually marked as error — workflow did not complete",
      updatedAt: new Date(),
    })
    .where(inArray(ingestionJobs.id, ids));

  return c.json({
    updated: ids.length,
    message: `Marked ${ids.length} active job(s) as errors`,
  });
});

/**
 * POST /api/processing/bulk-discard
 *
 * Discard all errored jobs in one shot (cleanup).
 */
processingRouter.post("/bulk-discard", async (c) => {
  const db = getDb(c.env);

  const errJobs = await db
    .select({ id: ingestionJobs.id })
    .from(ingestionJobs)
    .where(eq(ingestionJobs.state, "err"));

  if (errJobs.length === 0) {
    return c.json({ updated: 0, message: "No errored jobs to discard" });
  }

  const ids = errJobs.map((j) => j.id);

  await db
    .update(ingestionJobs)
    .set({ state: "discarded", updatedAt: new Date() })
    .where(inArray(ingestionJobs.id, ids));

  return c.json({
    updated: ids.length,
    message: `Discarded ${ids.length} errored job(s)`,
  });
});

