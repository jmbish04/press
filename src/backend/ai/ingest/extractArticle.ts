/**
 * @fileoverview Kimi K2.6 structured article extraction.
 *
 * Replaces the old two-step extract + cleanContent pipeline with a single
 * Kimi K2.6 call using `response_format: { type: "json_schema" }`. Sends the
 * FULL rawContent (no slicing — Kimi has 262K context). Returns structured
 * metadata, clean HTML article body, and image placement information.
 *
 * The `articleContent` field is **clean HTML** — `<p>`, `<strong>`, `<a>`,
 * `<h2>`, `<h3>`, `<blockquote>`, `<ul>/<li>`, `<code>` — ready for the
 * Reader to render with `dangerouslySetInnerHTML`. No markdown. No nav junk.
 */

import { AI_GATEWAY_OPTIONS, MODELS } from "../gateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImagePlacement {
  /** Paragraph index (0-based) where this image appeared in the article body. */
  position: number;
  /** Descriptive alt text for the image. */
  altText: string;
  /** Caption if present (empty string if none). */
  caption: string;
  /** Original `<img>` src URL from the scraped page. */
  originalSrc: string;
}

export interface ArticleExtraction {
  /** Article author, empty string if unknown. */
  author: string;
  /** Publication date in ISO 8601 (e.g. "2025-03-15"), empty if unknown. */
  datePublished: string;
  /** Article headline / title. */
  articleTitle: string;
  /** 2-3 sentence neutral summary. */
  summary: string;
  /** Primary subject category (e.g. "Technology", "Politics"). */
  topic: string;
  /** Publication or website name (e.g. "The Verge"). */
  source: string;
  /**
   * Cleaned article body as semantic HTML. Includes `<p>`, `<strong>`,
   * `<em>`, `<a href="...">`, `<h2>`, `<h3>`, `<blockquote>`, `<ul>/<ol>/<li>`,
   * `<code>/<pre>`. No nav, footer, cookie, share, or comment boilerplate.
   */
  articleContent: string;
  /** Meaningful article images and their positions within the body. */
  imagePlacements: ImagePlacement[];
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** JSON Schema enforced on Kimi's structured response. */
const ARTICLE_EXTRACTION_SCHEMA = {
  name: "article_extraction",
  schema: {
    type: "object",
    properties: {
      author: { type: "string", description: "Article author, empty string if unknown" },
      datePublished: { type: "string", description: "ISO 8601 date (e.g. 2025-03-15), empty if unknown" },
      articleTitle: { type: "string", description: "Article headline" },
      summary: { type: "string", description: "2-3 sentence neutral summary" },
      topic: { type: "string", description: "Primary subject category" },
      source: { type: "string", description: "Publication or website name" },
      articleContent: {
        type: "string",
        description:
          "The full cleaned article body as semantic HTML. " +
          "Use <p> for paragraphs, <strong>/<em> for emphasis, <a href> for links (preserving original hrefs), " +
          "<h2>/<h3> for subheadings, <blockquote> for quotes, <ul>/<ol>/<li> for lists, <pre><code> for code blocks. " +
          "Strip all navigation, footer, cookie, share, sidebar, and comment content. " +
          "Return the COMPLETE article — do NOT truncate or summarize.",
      },
      imagePlacements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            position: { type: "integer", description: "0-based paragraph index where this image belongs" },
            altText: { type: "string", description: "Descriptive alt text" },
            caption: { type: "string", description: "Image caption if present, empty string otherwise" },
            originalSrc: { type: "string", description: "Original <img> src URL" },
          },
          required: ["position", "altText", "originalSrc"],
        },
        description: "Meaningful article images (hero, inline photos, diagrams). Exclude ads, pixels, icons, avatars.",
      },
    },
    required: ["articleTitle", "articleContent", "imagePlacements", "summary", "topic"],
  },
} as const;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a precision article extractor. Given raw text scraped from a web page, extract structured data and return clean semantic HTML for the article body.

## Rules for articleContent
- Return the COMPLETE article body as semantic HTML. Do NOT truncate, summarize, or shorten — include every paragraph.
- Use proper HTML tags: <p> for paragraphs, <strong>/<em> for emphasis, <a href="URL"> for hyperlinks (preserve original hrefs), <h2>/<h3> for subheadings, <blockquote> for blockquotes, <ul>/<ol>/<li> for lists, <pre><code> for code blocks.
- STRIP all of these from output: navigation menus, header/footer links, site chrome, cookie banners, newsletter signups, "Skip to main content", social sharing buttons, "Follow us on Twitter", advertisement text, comment sections, "Related articles", sidebar content, breadcrumbs, accessibility toggles.
- Preserve the natural reading flow and paragraph structure of the original article.
- Do NOT add any content, commentary, or formatting not present in the original.
- Do NOT wrap the entire output in a container div or article tag — just the direct content elements.

## Rules for imagePlacements
- Identify ONLY meaningful article images: hero images, inline editorial photos, charts, diagrams, infographics.
- EXCLUDE: ad images, tracking pixels (1x1), social media icons, author avatars (small headshots), decorative spacers, logos in nav/footer.
- Set position to the 0-based paragraph index where the image naturally belongs in the reading flow.
- If an image appeared between paragraphs 3 and 4, set position to 3.

## Rules for metadata
- Extract author from the byline if visible. Empty string if not found.
- Extract datePublished in ISO 8601 format from the dateline/byline. Empty string if not visible.
- source is the publication name (e.g. "The Verge", "TechCrunch").
- topic is a single primary category (e.g. "Technology", "AI", "Business").`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Extract structured article data from raw scraped text using Kimi K2.6.
 *
 * Sends the FULL rawContent — no slicing, no truncation. Kimi's 262K context
 * window handles any article length. Returns metadata + clean HTML body +
 * image placements.
 *
 * @param env Worker env bindings
 * @param rawContent Full `document.body.innerText` from Browser Rendering
 * @returns Structured extraction, or a minimal fallback on AI failure
 */
export async function extractArticle(
  env: Env,
  rawContent: string,
): Promise<ArticleExtraction> {
  // Guard: too short to extract meaningfully.
  if (!rawContent || rawContent.trim().length < 200) {
    return {
      author: "",
      datePublished: "",
      articleTitle: "",
      summary: "",
      topic: "",
      source: "",
      articleContent: rawContent ? `<p>${escapeHtml(rawContent.trim())}</p>` : "",
      imagePlacements: [],
    };
  }

  try {
    const response = await env.AI.run(
      MODELS.extract,
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: rawContent },
        ],
        response_format: {
          type: "json_schema",
          json_schema: ARTICLE_EXTRACTION_SCHEMA,
        },
      } as never,
      AI_GATEWAY_OPTIONS,
    );

    const raw = (response as { response?: unknown }).response;
    const parsed: unknown = typeof raw === "string" ? safeParse(raw) : raw;

    if (parsed && typeof parsed === "object" && "articleContent" in (parsed as object)) {
      const result = parsed as ArticleExtraction;

      // Ensure all string fields have defaults.
      return {
        author: result.author ?? "",
        datePublished: result.datePublished ?? "",
        articleTitle: result.articleTitle ?? "",
        summary: result.summary ?? "",
        topic: result.topic ?? "",
        source: result.source ?? "",
        articleContent: result.articleContent ?? "",
        imagePlacements: Array.isArray(result.imagePlacements) ? result.imagePlacements : [],
      };
    }

    // AI returned something but missing articleContent — fallback.
    console.error("extractArticle: Kimi response missing articleContent");
    return fallback(rawContent);
  } catch (err) {
    console.error("extractArticle: Kimi extraction failed:", err);
    return fallback(rawContent);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fallback(rawContent: string): ArticleExtraction {
  // Wrap each paragraph in <p> tags as a basic fallback.
  const paragraphs = rawContent
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0)
    .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
    .join("\n");

  return {
    author: "",
    datePublished: "",
    articleTitle: "",
    summary: "",
    topic: "",
    source: "",
    articleContent: paragraphs,
    imagePlacements: [],
  };
}

function safeParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
