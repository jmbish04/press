# Frontend Fixes + Auto-Audio + Mobile Responsiveness

8 issues to address across backend workflow, API routing, and all frontend pages.

---

## 1. Newsstand: Screenshot Thumbnails

#### [MODIFY] [PressApp.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/PressApp.tsx)

Add `screenshotUrl` to the `Article` interface so it flows through to all pages.

```diff
 interface Article {
   id: number;
   title: string | null;
   url: string;
   source?: string | null;
   rawContent?: string | null;
   audioKey?: string | null;
   mindmapKey?: string | null;
+  screenshotUrl?: string | null;
   createdAt?: string | null;
 }
```

#### [MODIFY] [Newsstand.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Newsstand.tsx)

- Add `screenshotUrl` to local `Article` interface
- In `ArticleCard`, if `screenshotUrl` exists render `<img>`, else fall back to synthetic render preview
- The `.src-tab` overlay stays as the publication name badge

---

## 2. Article Titles from AI Extraction

#### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)

The `hostOf()` function doesn't strip `www.`. Fix:

```diff
 function hostOf(url: string): string {
   try {
-    return new URL(url).hostname;
+    return new URL(url).hostname.replace(/^www\./, "");
   } catch {
     return url;
   }
 }
```

The `shapeArticle` already does `properties.title ?? properties.topic ?? hostOf(url)` — so articles with AI-extracted titles already show correctly. This fix just cleans up the fallback.

---

## 3. Notebook: Rebuilt to v2 Reference + assistant-ui

#### [MODIFY] [Notebook.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Notebook.tsx)

Full rewrite to match the v2 reference. Key changes:

- **Three source modes**: All / By Tag / Pick Articles (segment control)
- **Real agent chat**: `useAgent` + `useAgentChat` → `ArticleChatAgent` with dynamic `pinnedArticleIds` based on selected scope
- **assistant-ui Thread**: Replace fake setTimeout chat with `AssistantRuntimeProvider` + `Thread`
- **AI orb branding** in chat header with scope label
- **Action buttons**: "Map" (generate mindmap) + "Build" (spawn PWA) in header
- **Suggested prompt cards** in empty state (2×2 grid)
- **Mobile drawer** for sources panel (slide-in on ≤980px)

---

## 4. Voices Endpoint: Fix Auth Conflict

#### [MODIFY] [narration.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/narration.ts)

Move voices list into the `narrationRouter` (mounted at `/api/articles`) instead of a separate `voicesRouter` at `/api/ai`. New path: `GET /api/articles/voices`.

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/press/src/backend/api/index.ts)

Remove `voicesRouter` import and route mount.

#### [MODIFY] [Settings.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Settings.tsx)

Update fetch URL from `/api/ai/voices` to `/api/articles/voices`.

---

## 5. Article Chat: assistant-ui Modal

#### [MODIFY] [ArticleAssistant.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/ArticleAssistant.tsx)

Replace the custom floating panel with `@assistant-ui/react`'s `AssistantModal` component:

- Floating trigger button (ai-orb pill)
- Opens a modal popup with `Thread` + `Composer` inside
- Proper backdrop, focus trap, close-on-escape

---

## 6. Article View: Show Real Screenshot

#### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)

The "screenshot" tab currently renders a synthetic CSS preview. Replace with:

- If `screenshotUrl` exists → render `<img src={screenshotUrl}>`
- If not → show the synthetic preview as fallback
- Add `screenshotUrl` to the local `Article` interface

Also need to pass `screenshotUrl` from `PressApp` → `ArticleView`.

---

## 7. Auto-Generate TTS Audio During Processing

#### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)

Add **Step 8: Audio** after mindmap (step 7), before finalize. The workflow becomes 8 steps:

1. fetch → 2. render → 3. extract → 4. embed → 5. index → 6. tags → 7. mindmap → **8. audio** → finalize

The audio step:
1. Takes the article `rawContent` (truncated to ~5000 chars)
2. Calls `env.AI.run("@cf/deepgram/aura-2-en", { text, voice: "asteria" })` (default voice)
3. Saves WAV to R2 at `audio/article-{articleId}.wav`
4. Updates the `articles.audioKey` column in D1

This means every new article will have audio ready when the ArticleView loads — no "Generate" button needed.

#### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)

Update the audio section:
- If `audioKey` exists → show play button immediately (audio streams from `/api/articles/:id/audio`)
- If not → show "Generate" button as fallback
- Wire the play button to an `<audio>` element that streams from the R2-backed endpoint

#### [MODIFY] [ingestion_jobs.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/ingestion_jobs.ts)

Update stage comment: `0=queued, 1=fetch, 2=render, 3=extract, 4=embed, 5=index, 6=tags, 7=mindmap, 8=audio`

#### [MODIFY] [Processing.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/Processing.tsx)

Update `STAGES` array:

```diff
-const STAGES = ["Fetch", "Render", "Extract", "Embed", "Index", "Mindmap"];
+const STAGES = ["Fetch", "Render", "Extract", "Embed", "Index", "Tags", "Mindmap", "Audio"];
```

---

## 8. Mobile Responsiveness

#### [MODIFY] [press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css)

Existing breakpoints: `760px` (mobile) and `980px` (tablet). These cover most cases but need additions:

- **Newsstand grid**: `grid-template-columns` should go to `1fr 1fr` on mobile (currently `repeat(auto-fill, minmax(190px, 1fr))` which works but cards get tiny)
- **Processing table**: Horizontal scroll on mobile (already has `overflow: auto`)
- **Settings page**: Stack sections vertically on mobile
- **Studio page**: Responsive grid
- **Ingest page**: Full-width textarea on mobile

Add mobile-specific refinements:

```css
@media (max-width: 760px) {
  .grid-view { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .proc-table th, .proc-table td { font-size: 11px; padding: 8px 6px; }
  .av-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .nb-compose-inner { padding: 0 12px; }
}
```

---

## Verification Plan

### Automated
- `pnpm tsc --noEmit` — 0 errors
- `pnpm build` — clean

### Manual
- Newsstand: screenshot thumbnails render, fallback works for articles without screenshots
- ArticleView screenshot tab: shows real browser screenshot
- ArticleView audio: plays immediately for newly processed articles
- Notebook: three-pane UI, real agent chat, mobile drawer
- Settings → Narration: voices load
- Processing: 8-stage pipeline labels
- All pages: test at 375px (iPhone) and 1440px (desktop)
