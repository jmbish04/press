/**
 * @fileoverview Visitor analytics middleware — logs page views to D1.
 *
 * Extracts IP, User-Agent, device type, browser, OS, and Cloudflare geo
 * headers. Runs as fire-and-forget after response to avoid latency impact.
 */

import { getDb } from "../../db";
import { visitorLogs } from "../../db/schemas";

import type { Context, Next } from "hono";

// ---------------------------------------------------------------------------
// UA parsing helpers (lightweight, no deps)
// ---------------------------------------------------------------------------

function parseDeviceType(ua: string): string {
  if (/iPad|tablet|kindle|silk/i.test(ua)) return "tablet";
  if (/Mobile|iPhone|iPod|Android.*Mobile|webOS/i.test(ua)) return "mobile";
  return "desktop";
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR|Opera/i.test(ua)) return "Opera";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Firefox\//i.test(ua)) return "Firefox";
  return "Unknown";
}

function parseOS(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|macOS/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Hono middleware that logs visitor data to D1.
 *
 * Only logs page-level navigations (not static assets or API calls that
 * shouldn't count as "visits"). Runs the DB insert after the response
 * is sent via `c.executionCtx.waitUntil`.
 */
export function visitorTracker() {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    await next();

    // Only track successful HTML page loads and API reads.
    const path = new URL(c.req.url).pathname;
    const isPage = !path.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2?|webp|map)$/i);
    if (!isPage) return;

    // Fire-and-forget — don't block the response.
    const ua = c.req.header("user-agent") ?? "";
    const cf = (c.req.raw as unknown as { cf?: Record<string, string> }).cf ?? {};

    const logEntry = {
      ipAddress:
        c.req.header("cf-connecting-ip") ??
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
        null,
      userAgent: ua.slice(0, 512),
      deviceType: parseDeviceType(ua),
      browser: parseBrowser(ua),
      os: parseOS(ua),
      country: cf.country ?? null,
      city: cf.city ?? null,
      region: cf.region ?? null,
      latitude: cf.latitude ?? null,
      longitude: cf.longitude ?? null,
      path,
      referer: c.req.header("referer")?.slice(0, 512) ?? null,
    };

    try {
      const db = getDb(c.env);
      c.executionCtx.waitUntil(
        db.insert(visitorLogs).values(logEntry).then(() => {}),
      );
    } catch {
      // Silently fail — analytics should never break the app.
    }
  };
}
