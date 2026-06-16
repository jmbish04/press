/**
 * @fileoverview Browser Rendering via the Cloudflare REST API.
 *
 * The `env.BROWSER` binding (`@cloudflare/puppeteer`) hangs on
 * `puppeteer.launch()` when called from inside a Cloudflare Workflow — the
 * launch never acquires a session and times out. The Browser Rendering REST
 * API does not have this problem, so the ingestion pipeline renders through it
 * instead.
 *
 * @see https://developers.cloudflare.com/api/resources/browser_rendering/
 */

import { getCloudflareAccountId, getBrowserRenderToken } from "../../utils/secrets";

const API_BASE = "https://api.cloudflare.com/client/v4/accounts";

/** Shared page-load options. networkidle2 is a good speed/completeness balance. */
const GOTO_OPTIONS = { waitUntil: "networkidle2", timeout: 30000 } as const;

interface ScreenshotOpts {
  fullPage?: boolean;
  width?: number;
  height?: number;
  quality?: number;
}

// ---------------------------------------------------------------------------
// REST transport
// ---------------------------------------------------------------------------

async function brPost(env: Env, path: string, body: unknown): Promise<Response> {
  const [accountId, token] = await Promise.all([
    getCloudflareAccountId(env),
    getBrowserRenderToken(env),
  ]);
  return fetch(`${API_BASE}/${accountId}/browser-rendering/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Fetch the fully rendered HTML of a page. Throws on failure (so steps retry). */
export async function renderContent(env: Env, url: string): Promise<string> {
  const resp = await brPost(env, "content", { url, gotoOptions: GOTO_OPTIONS });
  if (!resp.ok) {
    throw new Error(`browser-rendering/content ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const data = (await resp.json()) as { success?: boolean; result?: unknown; errors?: unknown };
  if (!data.success || typeof data.result !== "string") {
    throw new Error(`browser-rendering/content failed: ${JSON.stringify(data.errors ?? data).slice(0, 200)}`);
  }
  return data.result;
}

/** Capture a screenshot (JPEG). Returns raw image bytes. */
export async function renderScreenshot(env: Env, url: string, opts: ScreenshotOpts = {}): Promise<Uint8Array> {
  const resp = await brPost(env, "screenshot", {
    url,
    screenshotOptions: { fullPage: !!opts.fullPage, type: "jpeg", quality: opts.quality ?? 75 },
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 800 },
    gotoOptions: GOTO_OPTIONS,
  });
  if (!resp.ok) {
    throw new Error(`browser-rendering/screenshot ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  const ct = resp.headers.get("content-type") ?? "";
  if (ct.startsWith("image/")) {
    return new Uint8Array(await resp.arrayBuffer());
  }
  // Some responses wrap a base64 image in the standard JSON envelope.
  const data = (await resp.json()) as { result?: unknown };
  if (typeof data.result === "string") return base64ToBytes(data.result);
  throw new Error(`browser-rendering/screenshot: unexpected content-type "${ct}"`);
}

/** Render a page to PDF. Returns raw PDF bytes. */
export async function renderPdf(
  env: Env,
  url: string,
  pdfOptions: Record<string, unknown> = {},
): Promise<Uint8Array> {
  const resp = await brPost(env, "pdf", {
    url,
    pdfOptions: { printBackground: true, format: "A4", ...pdfOptions },
    gotoOptions: GOTO_OPTIONS,
  });
  if (!resp.ok) {
    throw new Error(`browser-rendering/pdf ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  }
  return new Uint8Array(await resp.arrayBuffer());
}

// ---------------------------------------------------------------------------
// HTML helpers (no DOM in Workers — parse the rendered HTML string directly)
// ---------------------------------------------------------------------------

/** URL fragments that indicate ad / tracking / junk images. */
const JUNK_IMG = [
  /doubleclick/i, /googlesyndication/i, /facebook\.com\/tr/i, /analytics/i,
  /\bpixel\b/i, /tracker/i, /beacon/i, /adserver/i, /ad[_-]?banner/i,
  /adsense/i, /taboola/i, /outbrain/i, /criteo/i, /amazon-adsystem/i, /pagead/i,
];

/** Decode the most common HTML entities. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&hellip;/gi, "…")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    });
}

/**
 * Convert rendered HTML to readable plain text (an `innerText` equivalent).
 * The downstream Kimi extraction strips boilerplate; this just needs to carry
 * the full page text including headings and paragraphs.
 */
export function htmlToText(html: string): string {
  let s = html.replace(/<(script|style|noscript|template|svg|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|figcaption|blockquote|ul|ol)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Read an attribute value from a tag string. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
}

/** Resolve a possibly-relative image URL against the page URL. */
function absolutize(src: string, baseUrl: string): string | null {
  try {
    // Decode HTML entities first — meta/img URLs often contain `&amp;`, which
    // would otherwise be sent verbatim to Cloudflare Images and fail to fetch.
    return new URL(decodeEntities(src).trim(), baseUrl).href;
  } catch {
    return null;
  }
}

/** Read a `<meta property|name="key" content="...">` value (either attr order). */
function matchMeta(html: string, key: string): string | null {
  const k = key.replace(/[:]/g, "\\$&");
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["']`, "i");
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null;
}

/** Pick the best real image URL from an `<img>` tag (handles lazy-load attrs). */
function pickImgSrc(block: string, baseUrl: string): string | null {
  const img = block.match(/<img\b[^>]*>/i);
  if (!img) return null;
  const tag = img[0];
  let src =
    attr(tag, "src") || attr(tag, "data-src") || attr(tag, "data-original") || attr(tag, "data-lazy-src");
  if (!src) {
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    if (srcset) src = srcset.split(",").pop()?.trim().split(/\s+/)[0] ?? ""; // last = highest-res
  }
  if (!src) return null;
  const abs = absolutize(src, baseUrl);
  if (!abs || abs.startsWith("data:") || /\.svg(\?|#|$)/i.test(abs)) return null;
  if (JUNK_IMG.some((re) => re.test(abs))) return null;
  return abs;
}

export interface ExtractedImage {
  src: string;
  caption: string;
  alt: string;
}

/**
 * Extract editorial images from rendered HTML, identified by their caption.
 *
 * `<figure>` elements that contain a `<figcaption>` are the cleanest signal of
 * a real article image (vs. ads, icons, avatars). We pull the image URL and
 * caption from each, de-dupe, and drop junk/ad/SVG URLs.
 */
export function extractImagesFromHtml(html: string, baseUrl: string): ExtractedImage[] {
  const out: ExtractedImage[] = [];
  const seen = new Set<string>();

  // 1. The Open Graph / Twitter hero image — present on virtually every
  //    article and almost always the lead editorial image.
  const ogImage = matchMeta(html, "og:image") ?? matchMeta(html, "twitter:image");
  if (ogImage) {
    const abs = absolutize(ogImage, baseUrl);
    if (abs && !abs.startsWith("data:") && !/\.svg(\?|#|$)/i.test(abs) && !JUNK_IMG.some((re) => re.test(abs))) {
      seen.add(abs);
      out.push({ src: abs, caption: "", alt: "Article image" });
    }
  }

  // 2. Captioned figures (editorial images that carry a <figcaption>).
  const figureRe = /<figure\b[^>]*>([\s\S]*?)<\/figure>/gi;
  let m: RegExpExecArray | null;
  while ((m = figureRe.exec(html)) !== null && out.length < 12) {
    const block = m[1];
    const capMatch = block.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i);
    const caption = capMatch ? htmlToText(capMatch[1]).trim() : "";
    if (!caption) continue; // caption-driven: only keep captioned figures

    const src = pickImgSrc(block, baseUrl);
    if (!src || seen.has(src)) continue;

    const altMatch = block.match(/<img\b[^>]*\balt\s*=\s*"([^"]*)"/i);
    seen.add(src);
    out.push({ src, caption, alt: altMatch?.[1] ?? "" });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  const comma = b64.indexOf(",");
  const raw = b64.startsWith("data:") && comma !== -1 ? b64.slice(comma + 1) : b64;
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
