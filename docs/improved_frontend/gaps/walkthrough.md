# Walkthrough: Frontend Fixes + Auto-Audio + Mobile

## Changes Made

### Backend

#### 1. `hostOf()` strips `www.` — [articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts#L34-L39)
The title fallback for articles without AI-extracted titles now returns clean domain names (`theregister.com`) instead of `www.theregister.com`.

#### 2. Voices endpoint moved — [narration.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/narration.ts#L500-L503)
Moved from a standalone `voicesRouter` at `/api/ai/voices` (conflicted with `aiRouter` auth middleware) into `narrationRouter` at `/api/articles/voices`. Removed the old import/mount from [index.ts](file:///Volumes/Projects/workers/press/src/backend/api/index.ts#L25).

#### 3. Auto-audio in workflow — [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts#L390-L440)
Added **Step 8: Audio** to the ingestion pipeline. Every new article now gets TTS narration via `@cf/deepgram/aura-2-en` (Asteria voice) during processing. Audio WAV saved to R2 at `audio/article-{id}.wav` and linked in D1 via `audioKey`. Non-critical — catches errors and continues.

Pipeline is now 8 steps: fetch → render → extract → embed → index → tags → mindmap → **audio**.

#### 4. Stage labels updated
- [ingestion_jobs.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/ingestion_jobs.ts#L8) — comment updated to `0–8`
- [Processing.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Processing.tsx#L29) — `STAGES` array now: `["Fetch", "Render", "Extract", "Embed", "Index", "Tags", "Mindmap", "Audio"]`

---

### Frontend

#### 5. Newsstand screenshot thumbnails — [Newsstand.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Newsstand.tsx#L42-L96)
Article cards now render the real browser screenshot (`<img>` from `screenshotUrl`) when available, falling back to the existing synthetic CSS render preview. `screenshotUrl` added to Article interface in both [PressApp.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressApp.tsx#L31) and Newsstand.

#### 6. ArticleView: real screenshots + audio player — [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)
- **Screenshot tab**: Shows the actual browser screenshot image when available; synthetic CSS preview as fallback
- **Audio player**: Replaced the non-functional custom play button with a native HTML5 `<audio controls>` element that streams directly from the R2-backed endpoint (`/api/articles/:id/audio`)

#### 7. Article chat: assistant-ui modal — [ArticleAssistant.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/ArticleAssistant.tsx)
Converted from custom floating panel to `AssistantModalPrimitive` (Root/Trigger/Content) from `@assistant-ui/react`. Floating pill trigger opens a styled popover modal with the Thread. Goes full-width on mobile via `.asst-modal` CSS.

#### 8. Notebook: full rebuild — [Notebook.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Notebook.tsx)
Complete rewrite matching the v2 reference:
- Three source modes: **All** / **By Tag** / **Pick Articles** (segment control)
- Real agent chat via `useAgent` + `useAgentChat` → `ArticleChatAgent`
- `assistant-ui Thread` for rendering (streaming, tool calls, markdown)
- AI orb + scope label in header
- **Map** and **Build** action buttons → triggers `GenerateModal`
- Mobile drawer for sources panel

#### 9. Settings voices — [Settings.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Settings.tsx#L49)
Fetch URL updated from `/api/ai/voices` → `/api/articles/voices`.

#### 10. Mobile CSS — [press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css#L488-L520)
Added at `≤760px` breakpoint:
- Newsstand grid → 2-column
- Processing table → tighter cells, 2-col stats
- Article tabs → horizontal scroll
- Assistant modal → full-width, bottom-sheet style
- Audio elements → max-width 100%

Added at `≤980px` breakpoint:
- Studio grid adapts
- Ingest form full-width

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | ✅ 0 errors |
| `pnpm build` | ✅ Clean build |
