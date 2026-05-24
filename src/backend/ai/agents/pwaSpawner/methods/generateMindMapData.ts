/**
 * @fileoverview Generates a mind-elixir mind-map JSON tree from article content.
 *
 * The agent stores the tree as JSON in R2 and the in-app `MindMap` component
 * (mindmapcn) renders it client-side — much richer than baking SVG/HTML
 * into a standalone artifact.
 */

import type { MindMapData } from "../types";

import { AI_GATEWAY_OPTIONS, MODELS } from "../../../gateway";

const SYSTEM_PROMPT =
  "You build concise, well-structured mind maps. Output strictly valid JSON " +
  "matching the schema in the user's message.";

function buildPrompt(title: string, content: string): string {
  return `Build a mind map titled "${title}" covering the key concepts in the
article content below. Return JSON only, with this exact shape:

{
  "nodeData": {
    "id": "root",
    "topic": "${title}",
    "children": [
      {
        "id": "1",
        "topic": "Main theme",
        "children": [
          { "id": "1-1", "topic": "Supporting detail" }
        ]
      }
    ]
  }
}

Constraints:
- Up to 7 top-level children.
- Up to 4 children per node.
- At most 3 levels deep.
- Each \`id\` must be unique (use the parent id + "-N").
- No trailing commas, no comments.

Article content:
${content}`;
}

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

/** Normalises whatever the model returned into a safe MindMapData tree. */
function shape(raw: unknown, fallbackTitle: string): MindMapData {
  const candidate =
    asNode(raw) ?? asNode((raw as { nodeData?: unknown } | null | undefined)?.nodeData) ?? null;

  if (!candidate) {
    return { nodeData: { id: "root", topic: fallbackTitle, children: [] } };
  }

  let counter = 0;
  const visit = (node: RawNode, parentId: string): import("../types").MindMapNode => {
    const id = typeof node.id === "string" && node.id ? node.id : `${parentId}-${counter++}`;
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

/** Calls Workers AI in JSON-object mode and returns a validated mind-map tree. */
export async function generateMindMapData(
  env: Env,
  articleContent: string,
  title: string,
): Promise<MindMapData> {
  const response = await env.AI.run(
    MODELS.extract,
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(title, articleContent.slice(0, 6000)) },
      ],
      response_format: { type: "json_object" },
    } as never,
    AI_GATEWAY_OPTIONS,
  );

  const raw = (response as { response?: unknown }).response;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  return shape(parsed, title);
}
