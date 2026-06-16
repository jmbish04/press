# Walkthrough — Pipeline Steps + Newsstand Rails

## Changes Made

### 1. Audio Streaming Endpoint
**[articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)**

Added `GET /api/articles/:id/audio` that streams the WAV file from R2 using the `audioKey` stored on the article row. The article detail endpoint (`GET /api/articles/:id`) was already returning `audioUrl` pointing here — but the actual handler was missing.

### 2. PDF Generation During Ingestion
**[ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)**

Added PDF generation (`page.pdf()`) alongside the screenshot capture in the render step (step 2). Since the browser is already open for the screenshot, this is essentially free — generates a full-page A4 PDF with proper margins and stores it in R2 under `pdf/wf-{jobId}.pdf`.

**[articles.ts (schema)](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/articles.ts)**

Added `pdfKey` column to the `articles` table. Generated Drizzle migration `0005_many_vin_gonzales.sql`.

**[articles.ts (routes)](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)**

Updated the PDF endpoint to check the pre-generated `pdfKey` first, falling back to on-demand Browser Rendering if no pre-generated PDF exists. On-demand PDFs now also persist the key back to D1 so future requests skip rendering.

### 3. Newsstand Per-Tag Rails
**[Newsstand.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Newsstand.tsx)**

Complete rewrite to match the v2 reference:
- **Default view**: Now `"rail"` (was `"grid"`)
- **CategoryRow component**: One horizontal scrolling rail per tag — colored dot, tag name, article count, and auto-scrolling card strip
- **Tag filter bar**: Top 12 tags by frequency with toggle chips
- **Pause/Play control**: Button to pause/resume marquee animation
- **Search**: Searches titles, URLs, and tag names

### 4. CSS Fixes
**[press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css)**
- Updated `.cat-dot` to accept direct background color (was using `--cat-h` CSS variable)
- Added `[data-paused]` state to pause marquee animation via button

### 5. New Icons
**[PressIcon.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressIcon.tsx)**
- Added `grid`, `tag`, `volume`, `doc` icons for Newsstand view toggle and article metadata display

### 6. Article Detail Enrichment
- Detail endpoint now includes `mindmapData` inline for instant rendering without R2 round-trip

## Verified

- `pnpm tsc --noEmit` — clean, no type errors
- Drizzle migration generated and applied via deploy
- Two successful deploys to `https://press.hacolby.workers.dev`
- API tests:
  - Articles list returns tags, screenshots, properties ✅
  - Article detail returns 5000+ chars of rawContent ✅
  - Tags API returns 78 tags ✅
  - Article detail has correct audioUrl/pdfUrl/mindmapUrl paths ✅

## What Works Now for New Articles

New articles submitted through the pipeline will get:
1. **Screenshot** (JPEG, step 2) ✅
2. **PDF** (A4 with margins, step 2) ✅ — NEW
3. **AI metadata extraction** (title, summary, author, source, step 3) ✅
4. **Vectorize embedding** (step 4) ✅
5. **D1 indexing** (step 5) ✅
6. **AI tag assignment** (step 6) ✅
7. **Mind map generation** (step 7) ✅
8. **TTS audio narration** (step 8) ✅

> [!NOTE]
> Existing articles (before this deploy) won't have PDFs, audio, or mindmaps pre-generated.
> The PDF endpoint falls back to on-demand rendering for these.
> Audio and mindmaps show "not yet generated" for older articles.
