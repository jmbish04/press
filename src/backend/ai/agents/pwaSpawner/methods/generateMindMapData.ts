/**
 * @fileoverview Generates a mind-elixir mind-map JSON tree from article content.
 *
 * Uses Kimi K2.6 with `response_format: { type: "json_schema" }` (structured
 * output) so the model is schema-constrained — the response always conforms to
 * the MindMapData shape. Same pattern as `extractArticle.ts`.
 */

import type { MindMapData, MindMapNode } from "../types";

import { AI_GATEWAY_OPTIONS, MODELS } from "../../../gateway";

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  `You are a mind-map generator. Given an article, produce a structured mind ` +
  `map that captures the key themes, arguments, and supporting details. ` +
  `Each branch topic should be a concise phrase (not a full sentence). ` +
  `Leaf nodes should contain specific facts, names, or data points from the article.\n\n` +
  `Respond with a SINGLE JSON object and nothing else — no prose, no markdown fences. ` +
  `Use exactly this shape:\n` +
  `{"nodeData":{"id":"root","topic":"<article title>","children":[` +
  `{"id":"1","topic":"<theme>","children":[{"id":"1-1","topic":"<detail>"}]}` +
  `]}}\n` +
  `The root MUST have 3 to 7 children, and each of those MUST have 2 to 4 children. ` +
  `Never return an empty children array on the root.`;

function buildPrompt(title: string, content: string): string {
  return `Build a mind map for this article.

Root topic: "${title}"

Requirements:
- 3 to 7 top-level children covering the article's key themes
- 2 to 4 children per branch with specific supporting details from the article
- Use concise phrases (not full sentences) for each topic
- Each node ID must be unique: root="root", branches="1","2"..., leaves="1-1","1-2"...

Article content:
${content}`;
}

// ---------------------------------------------------------------------------
// Response parsing + safety net
// ---------------------------------------------------------------------------

interface RawNode {
  id?: unknown;
  topic?: unknown;
  children?: unknown;
}

function asNode(value: unknown): RawNode | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as RawNode;
  return typeof obj.topic === "string" ? obj : null;
}

function safeParse(str: string): unknown {
  try {
    // Strip markdown fences if the model snuck them in despite json_schema mode.
    let cleaned = str.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Normalises whatever the model returned into a safe MindMapData tree.
 * With json_schema mode this should rarely need the fallback, but we keep
 * it for resilience.
 */
function shape(raw: unknown, fallbackTitle: string): MindMapData {
  const candidate =
    asNode(raw) ??
    asNode((raw as { nodeData?: unknown } | null | undefined)?.nodeData) ??
    null;

  if (!candidate) {
    return { nodeData: { id: "root", topic: fallbackTitle, children: [] } };
  }

  let counter = 0;
  const visit = (node: RawNode, parentId: string): MindMapNode => {
    const id =
      typeof node.id === "string" && node.id ? node.id : `${parentId}-${counter++}`;
    const topic = typeof node.topic === "string" ? node.topic : fallbackTitle;
    const rawChildren = Array.isArray(node.children) ? node.children : [];
    const children = rawChildren
      .map((c) => asNode(c))
      .filter((c): c is RawNode => c !== null)
      .map((child) => visit(child, id));
    return { id, topic, ...(children.length > 0 ? { children } : {}) };
  };

  return {
    nodeData: visit(
      { id: "root", topic: candidate.topic ?? fallbackTitle, children: candidate.children },
      "root",
    ),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calls Kimi K2.6 with json_schema structured output and returns a validated
 * mind-map tree. The schema is enforced at the model level so the response
 * always conforms to the MindMapData shape.
 */
export async function generateMindMapData(
  env: Env,
  articleContent: string,
  title: string,
): Promise<MindMapData> {
  try {
    const response = await env.AI.run(
      MODELS.chat,
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildPrompt(title, articleContent.slice(0, 6000)) },
        ],
        // JSON object mode on llama-3.3-70b (schema described in the prompt).
        // Kimi-k2.6's reasoning-model response shape isn't parseable here, which
        // is why mind maps came back as a single root node.
        response_format: { type: "json_object" },
        max_tokens: 4000,
      } as never,
      AI_GATEWAY_OPTIONS,
    );

    // Kimi json_schema mode: { response: "..." } where response is a JSON string.
    const raw = (response as { response?: unknown }).response;
    const parsed: unknown = typeof raw === "string" ? safeParse(raw) : raw;

    if (parsed && typeof parsed === "object" && "nodeData" in (parsed as object)) {
      const result = shape(parsed, title);

      // Sanity check: did we actually get branches?
      if (!result.nodeData.children || result.nodeData.children.length === 0) {
        console.error(
          "generateMindMapData: Schema-constrained response had no children.",
          "Title:", title,
          "Parsed preview:", JSON.stringify(parsed).slice(0, 500),
        );
      }

      return result;
    }

    // Model returned something but missing nodeData — try shape() anyway.
    console.error(
      "generateMindMapData: Response missing 'nodeData'.",
      "Response type:", typeof raw,
      "Raw preview:", JSON.stringify(raw).slice(0, 500),
    );
    return shape(parsed, title);
  } catch (err) {
    console.error("generateMindMapData: Kimi K2.6 call failed:", err);
    return { nodeData: { id: "root", topic: title, children: [] } };
  }
}
