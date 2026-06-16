/**
 * @fileoverview AI-powered content cleaning step.
 *
 * Strips navigation menus, cookie banners, share buttons, comment sections,
 * and other site chrome from raw article text, returning only the article
 * body as clean readable content with headings and paragraphs preserved.
 */

import { AI_GATEWAY_OPTIONS, MODELS } from "../gateway";

const CLEAN_SYSTEM_PROMPT = `You are a content extractor. Given raw text scraped from a web page, return ONLY the article body content.

Rules:
- Strip all navigation menus, header links, footer links, and site chrome from the top and bottom.
- Strip cookie banners, newsletter signup prompts, "Skip to main content" links.
- Strip social sharing buttons, "Follow us on Twitter", advertisement text.
- Strip comment sections, "N Comments", user-generated replies.
- Strip "Toggle dark mode", accessibility links, breadcrumbs.
- Strip "Related articles", "Recommended reading", sidebar content.
- Preserve the article headline, subheadline, author byline, and date if present in the body.
- Preserve all article paragraphs, headings (h2, h3), blockquotes, and lists.
- Preserve code blocks if the article contains them.
- Return clean readable text. Use blank lines between paragraphs.
- Do NOT add any commentary, headers, or formatting not in the original.
- If you cannot identify the article body, return the text as-is with obvious chrome removed.`;

/**
 * Clean raw scraped text content by stripping navigation and boilerplate.
 *
 * @param env - Worker env bindings (for Workers AI)
 * @param rawContent - The raw `document.body.innerText` from Browser Rendering
 * @returns Cleaned article content, or the original if AI fails
 */
export async function cleanArticleContent(env: Env, rawContent: string): Promise<string> {
  if (!rawContent || rawContent.trim().length < 200) {
    return rawContent;
  }

  try {
    // Send up to 8000 chars — enough for most articles.
    const inputText = rawContent.slice(0, 8000);

    const response = await env.AI.run(
      MODELS.extract,
      {
        messages: [
          { role: "system", content: CLEAN_SYSTEM_PROMPT },
          { role: "user", content: inputText },
        ],
      } as never,
      AI_GATEWAY_OPTIONS,
    );

    const result = (response as { response?: string }).response;
    if (result && typeof result === "string" && result.trim().length > 100) {
      return result.trim();
    }

    // Fallback: return original if AI output is too short or empty.
    return rawContent;
  } catch (err) {
    console.error("cleanArticleContent failed:", err);
    return rawContent;
  }
}
