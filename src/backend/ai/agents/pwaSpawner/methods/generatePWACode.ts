/**
 * @fileoverview Generates a single-file HTML artifact from article content.
 *
 * Uses a raw `env.AI.run` call routed through AI Gateway so the generation
 * model can be swapped for any provider without touching call sites.
 */

import type { ArtifactType } from "../types";

import { AI_GATEWAY_OPTIONS, MODELS } from "../../../gateway";

const INSTRUCTIONS: Record<ArtifactType, string> = {
  mindmap:
    "an interactive mind-map visualization with a radial tree layout. Each node is " +
    "clickable to expand or collapse its children.",
  "summary-card":
    "a polished summary-card UI with key quotes, recurring themes, and a TL;DR section.",
  pwa:
    "an installable reading app (include a web app manifest) with a sidebar to navigate " +
    "between articles, full-text search, and a reading-progress indicator.",
};

/** Removes markdown fences and any conversational preamble around the HTML. */
function extractHtml(text: string): string {
  let out = text.trim();
  const fenced = out.match(/```(?:html|jsx|tsx)?\s*\n?([\s\S]*?)```/i);
  if (fenced) out = fenced[1].trim();
  const docStart = out.search(/<!doctype html|<html[\s>]/i);
  if (docStart > 0) out = out.slice(docStart);
  return out.trim();
}

/**
 * Asks Workers AI to produce a complete, self-contained HTML document.
 */
export async function generatePWACode(
  env: Env,
  articleContent: string,
  title: string,
  type: ArtifactType,
): Promise<string> {
  const prompt = `Generate a complete single-file HTML document titled "${title}".
It must be ${INSTRUCTIONS[type]}
Constraints:
- React via CDN (no build step) and Tailwind via the CDN script.
- Dark theme.
- Return ONLY the HTML document — no markdown fences, no commentary.

Article content to base it on:
${articleContent}`;

  const response = await env.AI.run(
    MODELS.generate,
    {
      messages: [
        {
          role: "system",
          content: "You are an expert front-end engineer that outputs complete HTML documents.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 8192,
    } as never,
    AI_GATEWAY_OPTIONS,
  );

  const html = extractHtml(String((response as { response?: unknown }).response ?? ""));
  if (!html) throw new Error("Artifact generation returned no HTML.");
  return html;
}
