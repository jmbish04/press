/**
 * @fileoverview AI-driven tag assignment for article ingestion.
 *
 * During processing the AI agent receives:
 *   1. All existing tags (active + inactive/archived) with their descriptions
 *   2. The article content + title
 *
 * The agent decides which existing active tags to apply AND whether to create
 * new tags. New tags are inserted into D1 with name, description, and color.
 * All selected + newly created tags are linked via the `article_tags` junction.
 */

import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { tags, articleTags } from "../../db/schemas";
import { AI_GATEWAY_OPTIONS, MODELS } from "../gateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagRow {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  archived: boolean | null;
  isActive: boolean | null;
}

interface NewTag {
  name: string;
  description: string;
  color: string;
}

interface TagAssignmentResult {
  existingTagIds: number[];
  newTags: NewTag[];
}

export interface AssignTagsResult {
  /** IDs of all tags applied (existing + newly created). */
  appliedTagIds: number[];
  /** Names of tags the AI created during this run. */
  newlyCreatedTags: string[];
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildTagPrompt(
  articleTitle: string,
  articleContent: string,
  allTags: TagRow[],
): string {
  // Format the tags as JSON array for the AI
  const tagsJson = allTags.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    isActive: t.isActive !== false && !t.archived, // true or false
  }));

  return `You are a content categorization agent for a news archive called Press.

Given the article below, decide which tags to apply.

CRITICAL INSTRUCTIONS ON TAGS:
1. You are provided with a list of existing tags in the database as a JSON array below.
2. Each tag has an "id", "name", "description", and an "isActive" boolean.
3. If a tag has "isActive" as false, it means this tag and its description are NO LONGER ACTIVE. The user is uninterested in seeing any new tags or any content categorized under that inactive tag's description/topic. Do NOT assign inactive tags, and do NOT create new tags that cover the same topics or definitions as any inactive tag's description.
4. You should assign relevant existing ACTIVE tags (where "isActive" is true) by including their IDs in "existingTagIds".
5. If the article covers topics not well-represented by any existing active tags, and the topics are NOT related to inactive tags, you should propose NEW tags in "newTags".
6. For each new tag, provide:
   - "name": Concise name (e.g., "WebGPU", "SpaceX").
   - "description": Clear description of what the tag covers.
   - "color": A valid HTML hex color code (e.g., "#3b82f6").
   - "parentName": The name of an existing active tag or another new tag if this tag should be a sub-tag under a hierarchy (e.g. if you create "Siri", its parentName could be "Apple"). Set to null or omit for top-level tags.
7. An article should have between 1 and 5 tags total.

EXISTING TAGS CONFIGURATION:
${JSON.stringify(tagsJson, null, 2)}

Return strictly valid JSON with this exact shape:
{
  "existingTagIds": [1, 2],
  "newTags": [
    { "name": "Tag Name", "description": "What this tag covers", "color": "#hex", "parentName": "Parent Tag Name or null" }
  ]
}

If no new tags are needed, return an empty array for "newTags".
If no existing tags apply, return an empty array for "existingTagIds".

Article title: "${articleTitle}"

Article content:
${articleContent}`;
}

const SYSTEM_PROMPT =
  "You are a precise content categorization agent. Output strictly valid JSON matching the schema in the user's message. No explanation, no markdown fences, just the JSON object.";

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Uses Workers AI to assign tags to an article, creating new tags as needed.
 *
 * 1. Fetches all tags from D1 (active + inactive/archived)
 * 2. Sends article content + tag definitions to the AI
 * 3. Creates any new tags in D1
 * 4. Inserts article_tags junction rows
 */
export async function assignArticleTags(
  env: Env,
  articleId: number,
  articleContent: string,
  title: string,
): Promise<AssignTagsResult> {
  const db = getDb(env);

  // ── 1. Fetch all existing tags ──────────────────────────────────────
  const allTags = (await db.select().from(tags)) as TagRow[];

  const activeTags = allTags.filter((t) => t.isActive !== false && !t.archived);

  // ── 2. Ask AI for tag assignments ───────────────────────────────────
  const prompt = buildTagPrompt(
    title,
    articleContent.slice(0, 5000),
    allTags,
  );

  const response = await env.AI.run(
    MODELS.chat,
    {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    } as never,
    AI_GATEWAY_OPTIONS,
  );

  const raw = (response as { response?: unknown }).response;
  let parsed: { existingTagIds: number[]; newTags: (NewTag & { parentName?: string | null })[] } | null = null;

  try {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    const obj = JSON.parse(text) as unknown;
    if (obj && typeof obj === "object") {
      const candidate = obj as Record<string, unknown>;
      parsed = {
        existingTagIds: Array.isArray(candidate.existingTagIds)
          ? (candidate.existingTagIds as number[]).filter(
              (id) => typeof id === "number",
            )
          : [],
        newTags: Array.isArray(candidate.newTags)
          ? (candidate.newTags as any[]).filter(
              (t) =>
                typeof t === "object" &&
                t !== null &&
                typeof t.name === "string" &&
                typeof t.description === "string" &&
                typeof t.color === "string",
            )
          : [],
      };
    }
  } catch {
    console.error("Failed to parse AI tag assignment response:", raw);
  }

  if (!parsed) {
    return { appliedTagIds: [], newlyCreatedTags: [] };
  }

  // ── 3. Validate existing tag IDs ────────────────────────────────────
  const activeTagIds = new Set(activeTags.map((t) => t.id));
  const validExistingIds = parsed.existingTagIds.filter((id) =>
    activeTagIds.has(id),
  );

  // ── 4. Create new tags in D1 (resolving hierarchy) ──────────────────
  const nameToId = new Map<string, number>();
  for (const t of allTags) {
    nameToId.set(t.name.toLowerCase(), t.id);
  }

  const createdTagIds: number[] = [];
  const createdTagNames: string[] = [];

  let pendingTags = [...parsed.newTags];
  let iterations = 0;
  const maxIterations = pendingTags.length + 1;

  while (pendingTags.length > 0 && iterations < maxIterations) {
    iterations++;
    const nextPending: typeof pendingTags = [];

    for (const newTag of pendingTags) {
      const parentNameLower = newTag.parentName ? newTag.parentName.toLowerCase() : null;

      // If this tag has a parent that hasn't been resolved/created yet, defer it to the next pass.
      if (parentNameLower && !nameToId.has(parentNameLower)) {
        // Double check if the parent tag is in the parsed.newTags list.
        // If not, it means the AI referenced an existing tag name that doesn't exist.
        // We will defer it, but if it remains unresolved at the end, it will fallback to top-level.
        const parentInNew = parsed.newTags.some(t => t.name.toLowerCase() === parentNameLower);
        if (parentInNew) {
          nextPending.push(newTag);
          continue;
        }
      }

      // Check if this tag name already exists.
      const existing = allTags.find(
        (t) => t.name.toLowerCase() === newTag.name.toLowerCase(),
      );

      if (existing) {
        if (existing.isActive !== false && !existing.archived) {
          validExistingIds.push(existing.id);
        }
        nameToId.set(newTag.name.toLowerCase(), existing.id);
        continue;
      }

      // Resolve parentId if parentName was specified.
      let parentId: number | null = null;
      if (parentNameLower) {
        parentId = nameToId.get(parentNameLower) ?? null;
      }

      try {
        const inserted = await db
          .insert(tags)
          .values({
            name: newTag.name,
            description: newTag.description,
            color: newTag.color,
            parentId: parentId,
          })
          .returning({ id: tags.id });

        if (inserted[0]) {
          createdTagIds.push(inserted[0].id);
          createdTagNames.push(newTag.name);
          nameToId.set(newTag.name.toLowerCase(), inserted[0].id);
        }
      } catch (err) {
        console.warn(`Tag "${newTag.name}" already exists or insert failed, skipping:`, err);
      }
    }

    pendingTags = nextPending;
  }

  // Fallback: If there are still pending tags left (circular refs or unresolved parents),
  // insert them as top-level tags.
  for (const newTag of pendingTags) {
    const existing = allTags.find(
      (t) => t.name.toLowerCase() === newTag.name.toLowerCase(),
    );
    if (existing) {
      if (existing.isActive !== false && !existing.archived) {
        validExistingIds.push(existing.id);
      }
      continue;
    }

    try {
      const inserted = await db
        .insert(tags)
        .values({
          name: newTag.name,
          description: newTag.description,
          color: newTag.color,
          parentId: null,
        })
        .returning({ id: tags.id });

      if (inserted[0]) {
        createdTagIds.push(inserted[0].id);
        createdTagNames.push(newTag.name);
      }
    } catch (err) {
      console.warn(`Fallback tag insert failed for "${newTag.name}":`, err);
    }
  }

  // ── 5. Insert article_tags junction rows ────────────────────────────
  const allTagIds = [...new Set([...validExistingIds, ...createdTagIds])];

  if (allTagIds.length > 0) {
    // Delete any existing tag assignments for this article (idempotent re-runs).
    await db.delete(articleTags).where(eq(articleTags.articleId, articleId));

    // Insert fresh assignments.
    await db.insert(articleTags).values(
      allTagIds.map((tagId) => ({ articleId, tagId })),
    );
  }

  return {
    appliedTagIds: allTagIds,
    newlyCreatedTags: createdTagNames,
  };
}
