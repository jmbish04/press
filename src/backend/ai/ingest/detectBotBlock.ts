/**
 * @fileoverview Bot-block / access-denied detection via Workers AI.
 *
 * Some sites serve an anti-scraping page (Cloudflare challenge, CAPTCHA,
 * "Access Denied", "Enable JavaScript", paywall wall, etc.) instead of the
 * article. This classifies the scraped text so the pipeline can stop early and
 * record the URL as blocked rather than archiving a junk "article".
 */

import { AI_GATEWAY_OPTIONS, MODELS } from "../gateway";

const SYSTEM_PROMPT = `You classify text scraped from a web page that is supposed to be a news or blog ARTICLE.

Decide whether the text is a real article, OR a bot-block / anti-scraping / access-denied / error page that contains NO real article — for example:
- "Access Denied", "403 Forbidden", "Error 1020"
- "Are you a robot", a CAPTCHA, "Please verify you are human"
- a Cloudflare "Just a moment" / "Checking your browser before accessing" challenge
- "Enable JavaScript and cookies to continue", "Please turn on JavaScript"
- "unusual traffic from your computer network"
- an empty or placeholder page with no real content

CRITICAL: A real article almost always BEGINS with a navigation menu, site header, or list of section links (e.g. "Skip to main content", "Subscribe", "Sign In", "Tech", "Reviews", "Science"). That chrome is NORMAL and does NOT make a page blocked. If ANY real article prose — sentences and paragraphs about a topic — appears anywhere in the text, it is NOT blocked.

Only set "blocked": true when the ENTIRE text is a short challenge/denied/error message with NO article paragraphs at all. When unsure, choose false.

Respond with ONE JSON object and nothing else: {"blocked": boolean, "reason": "<at most 6 words>"}.`;

export interface BotBlockResult {
  blocked: boolean;
  reason: string;
}

/**
 * Classify whether scraped page text is a real article or a bot-block page.
 * Fails open: on any classifier error it returns `blocked: false` so a real
 * article is never wrongly blocked.
 */
export async function detectBotBlock(env: Env, text: string): Promise<BotBlockResult> {
  const trimmed = text.trim();
  if (!trimmed) return { blocked: false, reason: "" };

  // Real anti-bot / access-denied / challenge pages are SHORT. A long page
  // almost always contains a real article (even one that opens with a big
  // navigation menu), so never risk a false positive on it.
  if (trimmed.length > 2500) return { blocked: false, reason: "" };

  try {
    const response = await env.AI.run(
      MODELS.chat,
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: trimmed },
        ],
        response_format: { type: "json_object" },
        max_tokens: 150,
      } as never,
      AI_GATEWAY_OPTIONS,
    );

    const raw = (response as { response?: unknown }).response;
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (parsed && typeof parsed === "object" && typeof (parsed as { blocked?: unknown }).blocked === "boolean") {
      const p = parsed as { blocked: boolean; reason?: unknown };
      return { blocked: p.blocked, reason: String(p.reason ?? "").slice(0, 200) };
    }
  } catch (err) {
    console.error("detectBotBlock failed:", err);
  }

  return { blocked: false, reason: "" };
}
