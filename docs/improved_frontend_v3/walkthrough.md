# Press Pipeline & Viewport Fixes — Walkthrough

## Overview
Five interconnected fixes to the article ingestion pipeline and article viewport:

1. **Title extraction** — Kimi `articleTitle` now persisted to `articles.title`; URL slug fallback when AI extraction returns empty
2. **Markdown tab** — Raw scraped text uploaded to R2 as `.md` file; streamed to frontend via new `GET /api/articles/:id/markdown` route
3. **Full-page screenshot** — Separate `fullPage: true` Puppeteer screenshot for the article viewport (viewport-only shot stays for Newsstand cards)
4. **Transcription text** — HTML-stripped plain text stored in `transcriptionText` column; sent to Aura TTS instead of raw HTML (prevents Aura reading `<strong>` aloud)
5. **AudioPlayer + Transcription** — Replaced bare `<audio>` + "Generate audio" button with ai-elements `AudioPlayer` component; Whisper generates word-level timestamps; `Transcription` component highlights text as audio plays

---

## Schema Changes

### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/articles.ts)
Added 5 new columns:
- `title` — canonical title (from Kimi or URL slug)
- `markdownKey` — R2 key for raw markdown file
- `fullScreenshotKey` — R2 key for full-page screenshot
- `transcriptionText` — plain text for TTS (no HTML)
- `transcriptionSegments` — JSON array of `{ text, startSecond, endSecond }` from Whisper

### Migration: [0012_friendly_jazinda.sql](file:///Volumes/Projects/workers/press/drizzle/0012_friendly_jazinda.sql)

---

## Backend Changes

### [MODIFY] [processArticle.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/processArticle.ts)

**New helpers:**
- `titleFromUrl(url)` — extracts human-readable title from URL slug (`heres-how-apple-watch` → `Heres How Apple Watch`)
- `htmlToPlainText(html)` — strips all HTML tags for clean TTS input

**Pipeline additions (in order):**
1. Full-page screenshot (`fullPage: true`) saved to `screenshots/{id}-full.jpg`
2. Raw text uploaded to R2 as `markdown/{id}.md`
3. Canonical title resolved: `Kimi articleTitle > URL slug > hostname`
4. Plain text extracted from Kimi HTML for `transcriptionText`
5. TTS narration uses `transcriptionText` (not HTML)
6. Whisper runs on generated audio → word-level segments grouped by 5 → stored as JSON

### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)
- `shapeArticle()` now prefers `row.title` over `properties.title`
- List query includes `articles.title` column
- Detail response adds: `transcriptionText`, `transcriptionSegments`, `markdownUrl`, `fullScreenshotUrl`
- **New route:** `GET /api/articles/:id/markdown` — streams raw markdown from R2, falls back to `rawContent` from D1

---

## Frontend Changes

### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)

**Markdown tab:**
- No longer shows `readerContent` (HTML)
- Lazy-fetches from `/api/articles/:id/markdown` when tab is selected
- Displays the raw scraped text from R2

**Screenshot tab:**
- Uses `fullScreenshotUrl` (full-page capture) when available
- Falls back to viewport screenshot

**Reader tab:**
- When audio + transcription segments are available: renders `Transcription` component with word-level highlight synced to audio playback
- Click any segment to seek audio to that position
- Falls back to `cleanContent` HTML or raw paragraphs when no transcription

**Audio section:**
- Removed "Generate audio" button (audio is pre-generated during ingestion)
- Replaced bare `<audio>` with ai-elements `AudioPlayer`:
  - Play/Pause, Seek ±10s, Time display, Seek range, Duration, Mute
  - `ontimeupdate` syncs `audioCurrentTime` state → drives Transcription highlighting

### Installed components
- `media-chrome` v4.19.1
- `src/frontend/components/ai-elements/audio-player.tsx`
- `src/frontend/components/ai-elements/transcription.tsx`
- `src/frontend/components/ui/button-group.tsx`

---

## Verification
- ✅ TypeScript compiles clean
- ✅ Astro/Vite build succeeds (5.56s)

## Deployment
```bash
pnpm drizzle-kit push    # Apply migration 0012
pnpm deploy              # Ship to production
```
