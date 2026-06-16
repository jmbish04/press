# Smart Tag Assignment & D1 Mind Map Storage

Enhance article processing so the AI agent intelligently assigns tags (including creating new ones) and stores mind map configurations directly in D1 for instant rendering.

## Proposed Changes

### DB Schema Changes

#### [MODIFY] [tags.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/tags.ts)

Add `description` and `color` columns to the tags table so the AI agent can understand what each tag means and assign an HTML color. Rename `archived` → keep `archived` but clarify semantics. Add `isActive` boolean (default true).

```diff
 export const tags = sqliteTable("tags", {
   id: integer("id").primaryKey({ autoIncrement: true }),
   name: text("name").notNull().unique(),
+  /** Human-readable description of what this tag represents. */
+  description: text("description"),
+  /** HTML hex color code (e.g. "#3b82f6") for UI rendering. */
+  color: text("color"),
   archived: integer("archived", { mode: "boolean" }).default(false),
+  /** Whether the tag is actively used for new assignments. */
+  isActive: integer("is_active", { mode: "boolean" }).default(true),
   hue: integer("hue"),
 });
```

#### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/articles.ts)

Add `mindmapData` text column to store the mind map JSON config directly in D1 (no R2 fetch needed for page load). Keep `mindmapKey` for the R2 backup.

```diff
 export const articles = sqliteTable("articles", {
   ...
   mindmapKey: text("mindmap_key"),
+  /** JSON string of the MindElixirData mind map config for instant page-load rendering. */
+  mindmapData: text("mindmap_data"),
   ...
 });
```

After both schema changes → run `pnpm drizzle-kit generate`.

---

### Workflow: Smart Tag Assignment Step

#### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)

Insert a new **Step 5b: Tag Assignment** between the current Step 5 (Index) and Step 6 (Mind Map). The workflow becomes 7 steps:

1. fetch → 2. render → 3. extract → 4. embed → 5. index → **5b. tags** → 6. mindmap → 7. finalize

The tag step will:

1. **Fetch all existing tags from D1** — including `isActive=false` ones — with their `name`, `description`, `color`, `isActive`, and `archived` fields
2. **Build a system prompt** that presents the existing tag definitions + article content to the AI
3. **AI decides** which existing active tags to apply AND whether to create new ones
4. **Create any new tags in D1** with name, description, and color
5. **Insert `article_tags` junction rows** for all assignments

AI prompt structure:
```
You are a content categorization agent. Given the article content and the existing 
tag definitions below, decide which tags to apply. You may also create NEW tags if 
the article covers topics not well-represented by existing tags.

EXISTING ACTIVE TAGS:
- "AI/ML" (id:1): Articles about artificial intelligence and machine learning [#3b82f6]
- "Web Dev" (id:2): Frontend/backend web development topics [#22c55e]

INACTIVE/ARCHIVED TAGS (DO NOT use these or create equivalents):
- "Machine Learning" (id:5, archived): Superseded by "AI/ML" tag

Return JSON:
{
  "existingTagIds": [1, 2],        // IDs of existing active tags to apply
  "newTags": [                      // New tags to create and apply
    { "name": "Edge Computing", "description": "...", "color": "#..." }
  ]
}
```

#### [NEW] [assignTags.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/assignTags.ts)

Extracted helper function for the tag assignment logic:
- `assignArticleTags(env, articleId, articleContent, title)` 
- Fetches all tags from D1, builds AI prompt, parses response, creates new tags, inserts junction rows
- Returns `{ appliedTagIds: number[], newlyCreatedTags: string[] }`

---

### Workflow: Mind Map Stored in D1

#### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)

Update Step 6 (mindmap) to **also write the mind map JSON directly to the `mindmapData` column** in D1 alongside the R2 write. This means the frontend can render the mind map instantly from the article query without a separate `/api/articles/:id/mindmap` fetch to R2.

```diff
 // Save mind map JSON to R2.
 await this.env.SPAWNED_PWAS.put(mindmapKey, JSON.stringify(mindMapData), {...});

 // Update article row with BOTH the R2 key AND the inline JSON.
 const db = getDb(this.env);
 await db.update(articles)
-  .set({ mindmapKey })
+  .set({ mindmapKey, mindmapData: JSON.stringify(mindMapData) })
   .where(eq(articles.id, indexResult.articleId));
```

---

### Backend API Update

#### [MODIFY] [articles route](file:///Volumes/Projects/workers/press/src/backend/api/index.ts)

Update `GET /api/articles/:id/mindmap` to first check D1 `mindmapData` column, falling back to R2 fetch if null. This eliminates the R2 round-trip for articles processed after this change.

---

### Frontend: Use shadcn Mindmap Component

#### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)

Update the mindmap tab to use the shadcn `<MindMap>` component from `ui/mindmap.tsx` (already installed) instead of the custom SVG renderer. The data shape is already `MindElixirData` which is what the backend produces.

```tsx
import { MindMap, MindMapControls } from "@/components/ui/mindmap";

// In the mindmap tab:
<MindMap data={mindmapData} theme="dark" readonly fit>
  <MindMapControls position="top-right" />
</MindMap>
```

---

## Verification Plan

### Automated Tests
- `pnpm drizzle-kit generate` — verify migration SQL is correct
- `pnpm tsc --noEmit` — zero type errors
- `pnpm build` — clean build

### Manual Verification
- Deploy and ingest a test article → verify tags are assigned + new tags created in D1
- Verify mind map renders instantly on article view (no loading spinner for R2 fetch)
- Verify inactive/archived tags are NOT applied to new articles
