/**
 * @fileoverview Visitor analytics API — query visitor logs from D1.
 *
 * GET /api/analytics/visitors  — paginated visitor log
 * GET /api/analytics/stats     — aggregate stats (total, unique IPs, by device/country)
 */

import { Hono } from "hono";
import { desc, sql, count, countDistinct } from "drizzle-orm";
import { getDb } from "../../db";
import { visitorLogs } from "../../db/schemas";

export const analyticsRouter = new Hono<{ Bindings: Env }>();

/** Recent visitors — paginated. */
analyticsRouter.get("/visitors", async (c) => {
  const db = getDb(c.env);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

  const rows = await db
    .select()
    .from(visitorLogs)
    .orderBy(desc(visitorLogs.visitedAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: count() })
    .from(visitorLogs);

  return c.json({
    visitors: rows.map((r) => ({
      ...r,
      visitedAt: r.visitedAt?.toISOString() ?? null,
    })),
    total,
    limit,
    offset,
  });
});

/** Aggregate stats. */
analyticsRouter.get("/stats", async (c) => {
  const db = getDb(c.env);

  const [totals] = await db
    .select({
      totalVisits: count(),
      uniqueIps: countDistinct(visitorLogs.ipAddress),
    })
    .from(visitorLogs);

  // Top 10 countries.
  const byCountry = await db
    .select({
      country: visitorLogs.country,
      visits: count(),
    })
    .from(visitorLogs)
    .groupBy(visitorLogs.country)
    .orderBy(desc(count()))
    .limit(10);

  // By device type.
  const byDevice = await db
    .select({
      deviceType: visitorLogs.deviceType,
      visits: count(),
    })
    .from(visitorLogs)
    .groupBy(visitorLogs.deviceType)
    .orderBy(desc(count()));

  // By browser.
  const byBrowser = await db
    .select({
      browser: visitorLogs.browser,
      visits: count(),
    })
    .from(visitorLogs)
    .groupBy(visitorLogs.browser)
    .orderBy(desc(count()));

  // Top 10 pages.
  const byPage = await db
    .select({
      path: visitorLogs.path,
      visits: count(),
    })
    .from(visitorLogs)
    .groupBy(visitorLogs.path)
    .orderBy(desc(count()))
    .limit(10);

  // Visits per day (last 30 days).
  const dailyVisits = await db
    .select({
      day: sql<string>`date(${visitorLogs.visitedAt}, 'unixepoch')`.as("day"),
      visits: count(),
    })
    .from(visitorLogs)
    .where(sql`${visitorLogs.visitedAt} > unixepoch('now', '-30 days')`)
    .groupBy(sql`date(${visitorLogs.visitedAt}, 'unixepoch')`)
    .orderBy(sql`day`);

  return c.json({
    totalVisits: totals.totalVisits,
    uniqueIps: totals.uniqueIps,
    byCountry,
    byDevice,
    byBrowser,
    byPage,
    dailyVisits,
  });
});
