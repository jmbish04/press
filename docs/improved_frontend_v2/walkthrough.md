# Press v3 Pipeline Build — Walkthrough

> 🤖 **PRIMARY:** @backend-specialist | **SUPPORT:** @frontend-specialist, @database-architect | 🛠️ **Skills:** clean-code, database-design, api-patterns, react-best-practices

## Summary

All 4 phases of the [implementation plan](file:///Users/126colby/.gemini/antigravity-ide/brain/3f776a7f-c7fa-4047-beee-1c75a99a033f/implementation_plan.md) are complete. The Workflow is now the canonical 10-step pipeline, `processArticle.ts` is at full parity, and the frontend has been updated with source branding, tag editing, notifications, and clean content for the Reader view.

---

## Database Schema

### [NEW] [sources.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/sources.ts)
Publication source table with brand identity fields: `key` (unique domain key), `name`, `accent` color (sampled from masthead), `bg` color, `short` label.

### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/articles.ts)
Added three columns:
- `cleanContent` — AI-cleaned article body (nav/boilerplate stripped)
- `ragUuid` — UUID grouping chunked vectors for scoped RAG retrieval
- `sourceId` — FK to `sources` table for brand identity

### Migration: [0006_magical_komodo.sql](file:///Volumes/Projects/workers/press/drizzle/0006_magical_komodo.sql)
Creates `sources` table + unique index on `key`, adds the three new columns to `articles`.

---

## Pipeline Core

### [NEW] [cleanContent.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/cleanContent.ts)
Workers AI powered content cleaner — sends raw `innerText` to the extract model with a strict system prompt that strips nav menus, cookie banners, comment sections, share buttons, and sidebar content while preserving article body, headings, and code blocks.

### [NEW] [chunkText.ts](file:///Volumes/Projects/workers/press/src/backend/ai/rag/chunkText.ts)
Sentence-boundary-aware text chunking for RAG. Splits on paragraph boundaries first, then sentences, with configurable overlap (default 100 tokens). Returns `TextChunk[]` with index metadata for Vectorize upserts.

### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)
Complete rewrite — now 10 durable steps:

| Step | Name | What changed |
|------|------|-------------|
| 1 | fetch | No change |
| 2 | render | + Source resolution, + PDF generation |
| 3 | extract | + `publishedDate` in extraction schema |
| 4 | **clean** | **NEW** — AI content cleaning |
| 5 | **embed** | **Rewritten** — chunked vectors with `rag_uuid` metadata |
| 6 | index | + `cleanContent`, `ragUuid`, `sourceId` persisted; re-keys vectors with real article ID |
| 7 | tags | No change |
| 8 | mindmap | No change |
| 9 | audio | + Reads configured voice from `preferences` table |
| 10 | finalize | No change |

### [MODIFY] [processArticle.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/processArticle.ts)
Full parity rewrite with the Workflow. Now includes all 8 processing steps: screenshot, PDF, source resolution, metadata extraction (with publishedDate), clean content, chunked RAG, tags, mind map, and audio narration.

### [MODIFY] [articleRag.ts](file:///Volumes/Projects/workers/press/src/backend/ai/rag/articleRag.ts)
Chunk-aware RAG retrieval. Supports both legacy single-vector format (`id = "123"`) and new chunked format (`id = "123-chunk-0"`, `metadata.articleId = 123`). Deduplicates by article ID. Prefers `cleanContent` for excerpt grounding.

---

## API Layer

### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)
- Joins `sources` table — returns `SourceInfo` object with `name`, `accent`, `bg`, `short`
- Returns `cleanContent`, `publishedDate`, `author` in responses
- List endpoint passes `sourceId` through to `loadMeta`

### [MODIFY] [narration.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/narration.ts)
- Reads configured voice from `preferences` table (fallback: `asteria`)
- Uses `cleanContent` for better TTS narration quality

### [MODIFY] [tags.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/tags.ts)
- `POST /api/tags` now accepts `description` field

### [NEW] [backfill.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/backfill.ts)
Admin-guarded backfill API:
- `GET /api/admin/backfill/status` — counts incomplete articles per field
- `POST /api/admin/backfill/:id` — idempotently fills missing data (cleanContent, source, RAG, mindmap, audio)

### [MODIFY] [index.ts](file:///Volumes/Projects/workers/press/src/backend/api/index.ts)
Mounted backfill router at `/api/admin/backfill`.

---

## Frontend

### [NEW] [NotificationsPanel.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/NotificationsPanel.tsx)
Floating popover anchored to the bell button. Fetches notifications from `/api/notifications`, supports mark-read and mark-all-read. Type-colored icons (success=green, error=red, warning=amber).

### [MODIFY] [PressApp.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressApp.tsx)
- Exported `Article` and `SourceInfo` types
- Added notifications bell wiring (fetches unread count, toggles panel)
- `Article` type now includes `source`, `cleanContent`, `author`, `publishedDate`

### [MODIFY] [Newsstand.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Newsstand.tsx)
- Source accent colors from API for article cards and synthetic screenshot renders
- `src-tab` badge uses source accent color instead of generic dark overlay

### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)
- **Tag editing**: remove tags, add from existing, create new tags with name/description/color
- **Clean content**: Reader and Markdown tabs prefer `cleanContent` over raw
- **Author + published date**: shown in byline below the headline
- **Source branding**: accent-colored source badge in side panel

### [MODIFY] [press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css)
Added notification panel styles (`.notif-*`) and editable tag chip styles (`.tagchip`).

---

## Verification

| Check | Result |
|-------|--------|
| Drizzle migration generated | ✅ `0006_magical_komodo.sql` |
| Build (`pnpm run build`) | ✅ No errors |

## Next Steps

1. **Deploy**: `pnpm run deploy` to ship the migration + code
2. **Backfill**: Hit `GET /api/admin/backfill/status` to see how many existing articles need processing, then drive `POST /api/admin/backfill/:id` with the Python orchestrator
3. **Verify** source resolution and clean content on a few live articles
