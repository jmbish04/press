/**
 * @fileoverview Resolve or create a publication source from an article URL.
 *
 * During ingestion the worker calls `resolveSource()` with the article URL
 * and (optionally) a Puppeteer page to sample brand colors. If a `sources`
 * row already exists for the hostname, it's returned immediately. Otherwise
 * a new row is created — seeded from well-known defaults or auto-derived
 * from the page's computed styles / meta tags.
 */

import { eq } from "drizzle-orm";
import type { Page } from "@cloudflare/puppeteer";

import { getDb } from "../../db";
import { sources } from "../../db/schemas";

// ---------------------------------------------------------------------------
// Well-known source seed data
// ---------------------------------------------------------------------------

type SourceFace = "serif" | "grotesque" | "condensed" | "mono" | "slab";
const FACES: SourceFace[] = ["serif", "grotesque", "condensed", "mono", "slab"];

const SEED: Record<string, { name: string; accent: string; bg: string; short: string; ink: string; face: SourceFace }> = {
  "theverge.com":      { name: "The Verge",            accent: "#5200ff", bg: "#000000", short: "VRG",  ink: "#fff", face: "grotesque" },
  "wired.com":         { name: "Wired",                accent: "#000000", bg: "#ffffff", short: "WRD",  ink: "#fff", face: "condensed" },
  "arstechnica.com":   { name: "Ars Technica",         accent: "#ff4e00", bg: "#1a1a1a", short: "ARS",  ink: "#fff", face: "mono" },
  "techcrunch.com":    { name: "TechCrunch",           accent: "#0a9a00", bg: "#000000", short: "TC",   ink: "#fff", face: "grotesque" },
  "nytimes.com":       { name: "The New York Times",   accent: "#000000", bg: "#ffffff", short: "NYT",  ink: "#fff", face: "serif" },
  "washingtonpost.com":{ name: "The Washington Post",  accent: "#000000", bg: "#ffffff", short: "WP",   ink: "#fff", face: "serif" },
  "bbc.com":           { name: "BBC",                  accent: "#bb1919", bg: "#ffffff", short: "BBC",  ink: "#fff", face: "slab" },
  "bbc.co.uk":         { name: "BBC",                  accent: "#bb1919", bg: "#ffffff", short: "BBC",  ink: "#fff", face: "slab" },
  "theguardian.com":   { name: "The Guardian",         accent: "#052962", bg: "#ffffff", short: "GDN",  ink: "#fff", face: "serif" },
  "reuters.com":       { name: "Reuters",              accent: "#ff8000", bg: "#ffffff", short: "RTR",  ink: "#fff", face: "slab" },
  "bloomberg.com":     { name: "Bloomberg",            accent: "#000000", bg: "#ffffff", short: "BBG",  ink: "#fff", face: "serif" },
  "cnbc.com":          { name: "CNBC",                 accent: "#005594", bg: "#ffffff", short: "CNBC", ink: "#fff", face: "slab" },
  "engadget.com":      { name: "Engadget",             accent: "#5500e5", bg: "#000000", short: "ENG",  ink: "#fff", face: "grotesque" },
  "macrumors.com":     { name: "MacRumors",            accent: "#1d73c1", bg: "#ffffff", short: "MR",   ink: "#fff", face: "grotesque" },
  "9to5mac.com":       { name: "9to5Mac",              accent: "#1d73c1", bg: "#ffffff", short: "95M",  ink: "#fff", face: "grotesque" },
  "apnews.com":        { name: "AP News",              accent: "#e4002b", bg: "#ffffff", short: "AP",   ink: "#fff", face: "slab" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Derive a display name from a hostname (e.g. "theverge.com" → "The Verge"). */
function nameFromHost(host: string): string {
  const base = host.split(".")[0] ?? host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Derive a short badge string from a hostname. */
function shortFromHost(host: string): string {
  const base = host.split(".")[0] ?? host;
  return base.slice(0, 3).toUpperCase();
}

/** Simple hash of a string to a stable integer. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Derive a stable face from a hostname (deterministic). */
function faceFromHost(host: string): SourceFace {
  return FACES[simpleHash(host) % FACES.length];
}

/** Derive ink colour from accent luminance. Dark accent → white text, light → dark text. */
function inkFromAccent(accent: string | null): string {
  if (!accent) return "#fff";
  // Parse hex colour to get relative luminance.
  const hex = accent.replace(/^#/, "");
  if (hex.length < 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  // Approximate relative luminance.
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.55 ? "#111" : "#fff";
}

/** Sample brand colors from a Puppeteer page (best effort). */
async function sampleBrandColors(
  page: Page,
): Promise<{ accent: string; bg: string } | null> {
  try {
    const result = await page.evaluate(() => {
      // Try theme-color meta tag first.
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      const themeColor = themeMeta?.getAttribute("content") ?? null;

      // Try og:site_name for the name.
      // Sample header/nav computed styles.
      const header = document.querySelector("header") ?? document.querySelector("nav");
      let headerBg = "#ffffff";
      let headerColor = "#000000";
      if (header) {
        const computed = window.getComputedStyle(header);
        headerBg = computed.backgroundColor || "#ffffff";
        headerColor = computed.color || "#000000";
      }

      // Try primary link color as accent.
      const firstLink = document.querySelector("a[href]");
      let linkColor: string | null = null;
      if (firstLink) {
        linkColor = window.getComputedStyle(firstLink).color;
      }

      const accent = themeColor ?? linkColor ?? headerColor;
      const bg = headerBg;

      return { accent, bg };
    });

    return result;
  } catch {
    return null;
  }
}

/** Try to extract the site name from page meta. */
async function extractSiteName(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const ogSiteName = document.querySelector('meta[property="og:site_name"]');
      if (ogSiteName) return ogSiteName.getAttribute("content");
      const titleEl = document.querySelector("title");
      if (titleEl) {
        // Many sites do "Article Title - Site Name" or "Article Title | Site Name"
        const parts = titleEl.textContent?.split(/\s*[|\-–—]\s*/) ?? [];
        if (parts.length > 1) return parts[parts.length - 1]?.trim() ?? null;
      }
      return null;
    });
  } catch {
    return null;
  }
}

/** Retry lookup of a source to handle replication/transaction latency in concurrent race conditions. */
async function getSourceWithRetry(db: any, host: string, retries = 5, delay = 100): Promise<any> {
  for (let i = 0; i < retries; i++) {
    const row = await db.select().from(sources).where(eq(sources.key, host)).get();
    if (row) return row;
    if (i < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolvedSource {
  id: number;
  key: string;
  name: string;
  accent: string | null;
  bg: string | null;
  short: string | null;
  ink: string | null;
  face: string | null;
}

/**
 * Resolve or create a source for the given article URL.
 *
 * @param env - Worker env bindings
 * @param articleUrl - The article URL to derive the host from
 * @param page - Optional Puppeteer page (if browser is open) for color sampling
 */
export async function resolveSource(
  env: Env,
  articleUrl: string,
  page?: Page,
): Promise<ResolvedSource> {
  const host = hostOf(articleUrl);
  const db = getDb(env);

  // Check if source already exists.
  const existing = await db.select().from(sources).where(eq(sources.key, host)).get();
  if (existing) {
    return {
      id: existing.id,
      key: existing.key,
      name: existing.name,
      accent: existing.accent,
      bg: existing.bg,
      short: existing.short,
      ink: existing.ink,
      face: existing.face,
    };
  }

  // Check well-known seed data.
  const seed = SEED[host];
  if (seed) {
    const [inserted] = await db
      .insert(sources)
      .values({ key: host, name: seed.name, accent: seed.accent, bg: seed.bg, short: seed.short, ink: seed.ink, face: seed.face })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return { id: inserted.id, key: host, name: seed.name, accent: seed.accent, bg: seed.bg, short: seed.short, ink: seed.ink, face: seed.face };
    }
    // Race condition — re-fetch with retry.
    const refetched = await getSourceWithRetry(db, host);
    if (!refetched) {
      throw new Error(`Failed to resolve source key "${host}" after conflict on seed insert`);
    }
    return {
      id: refetched.id,
      key: host,
      name: refetched.name,
      accent: refetched.accent,
      bg: refetched.bg,
      short: refetched.short,
      ink: refetched.ink,
      face: refetched.face,
    };
  }

  // Auto-derive from the page if available.
  let accent: string | null = null;
  let bg: string | null = null;
  let name = nameFromHost(host);

  if (page) {
    const colors = await sampleBrandColors(page);
    if (colors) {
      accent = colors.accent;
      bg = colors.bg;
    }
    const siteName = await extractSiteName(page);
    if (siteName) name = siteName;
  }

  const short = shortFromHost(host);
  const ink = inkFromAccent(accent);
  const face = faceFromHost(host);

  const [created] = await db
    .insert(sources)
    .values({ key: host, name, accent, bg, short, ink, face })
    .onConflictDoNothing()
    .returning();

  if (created) {
    return { id: created.id, key: host, name, accent, bg, short, ink, face };
  }

  // Race condition fallback: re-fetch with retry.
  const fallback = await getSourceWithRetry(db, host);
  if (!fallback) {
    throw new Error(`Failed to resolve source key "${host}" after conflict on fallback insert`);
  }
  return {
    id: fallback.id,
    key: fallback.key,
    name: fallback.name,
    accent: fallback.accent,
    bg: fallback.bg,
    short: fallback.short,
    ink: fallback.ink,
    face: fallback.face,
  };
}
