# Press — Build Handoff & Coding‑Agent Prompt

This document is a **review of the gap between the original Press prototype and the current deployment** (`https://press.hacolby.workers.dev/`), followed by a **ready‑to‑paste prompt** for your coding agent that covers (a) the missing frontend and (b) every backend API the frontend needs.

The original interactive prototype is the **single source of truth** for layout, copy, and behaviour. Its files: `index.html`, `app.css`, `tokens.css`, `data.js`, and the components `Common.jsx`, `Shell.jsx`, `Ingest.jsx`, `Newsstand.jsx`, `Assistant.jsx`, `ArticleView.jsx`, `Notebook.jsx`, `Processing.jsx`, `Notifications.jsx`, `Settings.jsx`, `Mindmap.jsx`, `Studio.jsx`. Wherever this doc and the prototype disagree, the prototype wins.

---

## 1. Executive summary

The frontend was only **partially** reproduced, and the backend is **almost entirely missing**.

**Backend (the bigger problem).** `openapi.json` exposes exactly **two endpoints**, both ingest‑only:

- `POST /api/ingest` — `{ urlsString }` → `202 { status }`
- `POST /api/articles/submit` — `{ urls?[], urlsString? }` → `202 { accepted, results[] }`

The spec's own description promises that you can *"browse the archive, search via RAG, and manage tags and sessions"* and that *"An MCP server is also available at /mcp"* — **none of those routes exist.** So every screen except *Add to archive* has no data source: Newsstand, Article view, Notebook chat, Studio, Processing, Notifications, and the Tags/Saved‑Views admin all need APIs that were never built.

**Frontend.** The visible regressions you flagged map to specific, fully‑specified components in the prototype that were dropped or simplified:

| You said | What it is in the prototype | Source file |
|---|---|---|
| "the doc on the bottom is missing" | The floating **Article Assistant dock** — a bottom‑anchored "Ask about this article" pill that expands into a grounded chat panel; appears only on the article view. (Also verify the bottom **mobile tab bar**.) | `Assistant.jsx` → `ArticleAssistant`; `Shell.jsx` → `MobileTabBar` |
| "the rails don't look the same" | The Newsstand **auto‑scrolling category rails** (seamless marquee rows, one per desk, pause on hover / Pause button) — the signature "newsstand" motion. Also the **left sidebar rail** structure/order. | `Newsstand.jsx` → `CategoryRow`; `app.css` `.cat-row`/`.rail-track`; `Shell.jsx` → `Sidebar` |
| "config completely missed the admin settings for tags and saved views" | Settings → **Tags admin** (search, create, inline rename, archive/restore, merge‑mode with "keep which tag?" picker, per‑tag counts, show‑archived) and **Saved views admin** (cards + full include/exclude facet editor with any/all match toggles, soft delete/restore). | `Settings.jsx` → `TagsAdmin`, `ViewsAdmin` |

Full detail below.

---

## 2. Frontend gap analysis (feature by feature)

For each screen: what it must do, and the exact prototype reference. Tell the agent to rebuild to **pixel/behaviour parity** with the named component.

### 2.1 Left sidebar rail — `Shell.jsx` `Sidebar`
- Brand block: square "P" mark (`--brand` bg) + "Press" / "archive" sub‑label (mono, uppercase).
- Primary quick action: **"Add links"** button (filled `--primary`).
- Nav order is exactly: **Add to archive · Newsstand · Notebook · Studio · Processing**. Newsstand shows a live article count; Processing shows a red error count when > 0.
- **"Saved views"** section header, then one row per non‑deleted view with its hue dot, then a muted **"New view"** row that deep‑links into Settings → Saved views with the editor open.
- Footer: **"Settings & config"** row.
- Active item: `--sidebar-accent` bg + 3px `--brand` left bar (`.rail-item.active::before`).
- Collapsed mode hides all labels to an icons‑only rail; on mobile (`≤760px`) the rail becomes a full off‑canvas drawer with a scrim.

### 2.2 Newsstand — `Newsstand.jsx`
- **Stand view (default): auto‑scrolling category rails.** One `CategoryRow` per desk in `CATEGORIES`. When a row has ≥4 articles, the track is **duplicated and marquee‑animated** (`@keyframes marquee` translateX 0 → ‑50%) at a **per‑category duration** (`cat.dur` seconds). Animation **pauses on hover** and via the global **Pause/Play rows** button (`data-paused`). Respects `prefers-reduced-motion`. This is the missing "rails" look — it must scroll.
- Row head: hue dot + desk name + count + "Browse all →".
- **Grid view** toggle (segmented control) renders all articles as cards.
- **Search + tag filter bar**: live search over title/excerpt/source/tag labels; popular‑tag chips (top 12 by count) toggle as AND filters; "Clear" appears when active; results show a count and an empty state.
- `ArticleCard`: faux page render thumbnail (`PageRender`) + source tab + title + read‑mins + audio glyph.

### 2.3 Article view — `ArticleView.jsx` + `Assistant.jsx`
- Two‑column: document surface + right sidebar.
- **Tabs**: Reader · Mind map · Screenshot · PDF · Markdown (each its own surface; Mind map embeds `Mindmap`).
- Right sidebar blocks: **Source** card (logo, "Open original"), **AudioBlock** (idle → generating with progress bar → ready player with scrubber/download), **TagEditor** (combobox multiselect with create‑new; AI tags render dashed with a confidence number, manual tags solid), **Details** grid (ID, status, reading, embedded).
- **Floating Article Assistant dock** (`ArticleAssistant`) — the bottom element you're missing. Collapsed = "Ask about this article" pill; expanded = chat panel scoped to this one article, with suggestion chips and a composer. Must be present on every article view.

### 2.4 Notebook (archive‑wide RAG chat) — `Notebook.jsx`
- Left **Chat sources** panel with three scope modes: **All** (whole archive), **By tag** (multiselect tag cloud), **Pick** (searchable article checklist with thumbnails). Scope label updates live.
- Center chat: empty state with prompt cards (context‑aware suggestions), then a `ChatThread` with thinking indicator and per‑message citations.
- Header actions: **Map** (generate mind map from scope) and **Build** (generate a PWA from scope) → both open the Generate modal. "New chat" resets.

### 2.5 Studio — `Studio.jsx`
- Gallery of **artifacts** (`mindmap` and `pwa`) with type filter chips + counts.
- Mind‑map cards render a mini SVG preview; PWA cards render an actual mock phone screen (`PwaRender` → `InterviewCoachApp`, `PcBuilderApp`, or generic `GeneratedApp`).
- Store pills: "R2" + "D1 indexed".
- **ArtifactViewer** overlay: mind maps open full `Mindmap`; PWAs open in a phone frame beside a **"Keep iterating"** composer + **version history** list.
- Header: "New mind map" / "Build a PWA" → Generate modal.

### 2.6 Processing — `Processing.jsx`
- Live pipeline. Stat cards: In flight · Archived today · Errors · Avg time (with a pulsing live dot).
- Filter chips (All/Active/Done/Errors with counts).
- Table: job id · article (source dot + title + url) · **5‑stage pipeline track** (Fetch → Render → Extract → Embed → Index, each wait/active/done/err) · updated · status. Error rows expand to show the error code + message + Retry/Open/Discard actions.
- Currently the prototype simulates progress on a timer; the real version must reflect actual job state (ideally via SSE — see §3).

### 2.7 Notifications — `Notifications.jsx`
- Bell in the top bar with unread badge; opens `NotificationCenter` popover.
- Summary counts (processed today / failed / need review), tabs (All/Unread/Errors), grouped Today/Earlier feed, "Mark all read", and a "View processing pipeline" footer. Error/batch/retry items deep‑link to Processing.

### 2.8 Settings — `Settings.jsx` (the explicitly‑missing admin)
Five sections in a left sub‑nav: **Tags · Saved views · Ingestion · AI & Audio · Notifications.**

- **Tags admin (`TagsAdmin`)** — search; **New tag** (label + hue swatch picker); inline **rename**; **archive/restore** (reversible); **Merge mode**: select ≥2 tags → "Merge N tags" → "keep which tag?" target picker that reassigns counts and archives the rest; per‑tag article **counts** and `#id`; **Show archived** toggle.
- **Saved views admin (`ViewsAdmin`)** — list of view cards showing their facet chips; **editor** with: name, hue, **Include** facets for Tags / Keywords / Source domains (each with an **Any/All** match segment), **Exclude** facets for tags + keywords ("none‑of"); **soft delete + restore**. New views also reachable from the sidebar "New view" deep link (`focusNew`).
- **Ingestion (`IngestionPrefs`)** — AI tag confidence threshold slider; dedupe‑by‑URL; canonicalise/follow‑redirects; paywall handling select; blocked‑domains chip input.
- **AI & Audio (`AIPrefs`)** — read‑only auto‑detected Workers AI models (with Re‑detect); auto‑tag toggle; chunk‑size slider; **narration VoicePicker** (Deepgram Aura‑2 catalog, grouped, with sample playback); **AI Gateway** routing (gateway name, provider‑per‑task selects, API‑key secret field).
- **Notifications (`NotifPrefs`)** — per‑event toggles (archived / failed / review / batch / digest / email).

### 2.9 Ingest — `Ingest.jsx` (mostly present, verify)
- Paste‑zone that detects URLs live ("N links detected"), URL chips, **Use sample**, per‑URL result rows (archived/skipped/failed), and "how it works" cards. This is the one screen with a real backend — make sure the result statuses come from `POST /api/articles/submit`, not the local simulation.

### 2.10 Shared primitives — `Common.jsx`, `Mindmap.jsx`
- `Icon` (inline Lucide path set), `Button` (variants), `Tag` (hue + AI/manual origin), `PageRender` (synthetic source screenshot), `useClickOutside`, `catHue`. The **GenerateModal** (referenced from `index.html` as `<GenerateModal>`) drives mind‑map/PWA generation — confirm it exists and is wired. `Mindmap` is the interactive node graph used in the article tab and Studio.

---

## 3. Backend API surface to build

The frontend data shapes are defined in `data.js` — **match those exact field names** so the UI needs no rewrites. Suggested Cloudflare mapping: **D1** (relational), **Vectorize** (BGE‑M3, 1024‑dim chunk embeddings), **R2** (screenshots, PDFs, extracted markdown, narration mp3, generated PWA bundles), **Workers AI** (Llama 3.3 70B for tag/summary/chat, BGE‑M3 embeddings, Llama 3.2 11B Vision OCR, Deepgram Aura‑2 TTS), **Browser Rendering** (page capture), and **Queues + Workflows/Durable Objects** for the ingestion pipeline and live job state.

### Articles / archive
- `GET /api/articles` — browse + search. Query: `cat`, `tag` (repeatable, AND), `q`, `view` (saved‑view id), `src`, `cursor`, `limit`, `sort`. Returns paged array of the article shape: `{ id, cat, src, title, excerpt, tags: [[tagId, "ai"|"human", confidence?]], readMins, date, hasAudio, status }`. Backs Newsstand (rails, grid, search) and the Notebook source picker.
- `GET /api/articles/:id` — full detail: above + extracted `markdown`, `readerHtml`, `screenshotUrl` (R2), `pdfUrl` (R2), `mindmap` tree, `audioUrl?`, `embedded` flag.
- `PATCH /api/articles/:id/tags` — `{ add?: tagId[], remove?: tagId[] }` (manual edits from `TagEditor`).
- `DELETE /api/articles/:id`.

### Search / RAG
- `GET /api/search?q=` — metadata/full‑text search (can be `GET /api/articles?q=`).
- `POST /api/search/semantic` — `{ query, scope }` → Vectorize ANN over chunk embeddings, returns `{ chunks:[{ articleId, score, text }] }`. Used for retrieval before chat.

### Chat (Notebook + Article Assistant)
- `POST /api/chat` — `{ scope: { type: "all"|"tags"|"articles"|"article", tagIds?, articleIds?, articleId? }, messages: [...] }`. Server: resolve scope → semantic retrieval over Vectorize (scoped) → call Llama 3.3 70B with retrieved chunks → **stream** the answer (SSE) and return **citations** as article `{ id, title }`. Backs both `Notebook` and `ArticleAssistant`.
- `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/:id` — persist chat threads (the OpenAPI description's "sessions"). Optional but designed‑for.

### Tags admin
- `GET /api/tags` → `[{ id, label, hue, count, archived }]`.
- `POST /api/tags` — `{ label, hue }`.
- `PATCH /api/tags/:id` — `{ label?, hue?, archived? }` (rename / recolor / archive / restore).
- `POST /api/tags/merge` — `{ sourceIds: [], targetId }` → reassign `article_tags`, archive merged tags, return updated counts.

### Saved views
- `GET /api/views` → list incl. `deleted`.
- `POST /api/views` — `{ name, hue, include: { tags:{match,items}, keywords:{match,items}, domains:{match,items} }, exclude: { tags:[], keywords:[] } }`.
- `PATCH /api/views/:id` (incl. `{ deleted }` for soft delete/restore).
- `DELETE /api/views/:id` (soft).
- View resolution: `GET /api/articles?view=:id` applies the include (any/all per facet) + exclude (none‑of) logic server‑side.

### Processing / pipeline
- `GET /api/jobs` — `[{ id, url, src, stage(1–5), state:"active"|"done"|"err", t, title, error? }]`.
- `GET /api/jobs/stream` — **SSE** stream of job updates (Processing is "live").
- `POST /api/jobs/:id/retry`, `DELETE /api/jobs/:id`.
- `GET /api/stats` — `{ inFlight, archivedToday, errors, avgTimeSeconds }` (Processing cards + notification summary).

### Audio / narration
- `POST /api/articles/:id/audio` — synthesize via Deepgram Aura‑2 (voice from settings), store mp3 in R2 → `{ audioUrl, durationSeconds }`.
- `GET /api/articles/:id/audio` — stream/download.

### Studio / artifacts
- `GET /api/artifacts` → `[{ id, type:"mindmap"|"pwa", title, source, date, tree?, app?, prompt?, r2Key, workerUrl? }]`.
- `POST /api/artifacts/generate` — `{ kind, scope, prompt }`. Mind map → LLM produces a `tree`. PWA → agent builds a shadcn app, **deploys to a dynamic worker** (Workers for Platforms / dispatch), stores the bundle in R2, indexes metadata in D1. Returns the artifact.
- `GET /api/artifacts/:id`, `POST /api/artifacts/:id/iterate` ( `{ prompt }` → new version + redeploy), `GET /api/artifacts/:id/versions`.

### Notifications
- `GET /api/notifications` → `[{ id, type, title, body, t, when:"today"|"earlier", read, articleId?, job? }]`.
- `POST /api/notifications/read` — `{ ids?: [] }` (omit = mark all).
- Optional SSE for live delivery.

### Settings / config
- `GET /api/settings` / `PATCH /api/settings` — ingestion prefs (threshold, dedupe, canonicalize, paywall, blockedDomains), AI prefs (autotag, chunkSize, voice, gateway { enabled, name, providers }), notification prefs.
- `GET /api/models` — auto‑detected Workers AI model bindings (read‑only; powers "Re‑detect").
- `GET /api/voices` — Aura‑2 voice catalog (or ship `AURA_VOICES` from `data.js`).

### Ingestion pipeline (make the two existing endpoints real)
`POST /api/ingest` and `POST /api/articles/submit` should enqueue a pipeline per URL: **Browser Rendering** capture → screenshot+PDF to R2 → text extract (+ Vision OCR fallback) → Workers AI summary + tag proposal (respecting the confidence threshold) → chunk + BGE‑M3 embed → Vectorize upsert + D1 insert. Emit job‑status events for `/api/jobs/stream` and create notifications. Keep the existing response shapes (`{ accepted, results[] }` with `archived|skipped|failed`).

### MCP
The description advertises `/mcp` — either implement an MCP server exposing read/search/ingest tools, or remove the claim from `openapi.json`.

---

## 4. The prompt (paste this into your coding agent)

> **Context:** You are completing the **Press** app (Cloudflare Workers + Astro + React, shadcn dark theme). The original interactive prototype — `index.html`, `app.css`, `tokens.css`, `data.js`, and the JSX components (`Common.jsx`, `Shell.jsx`, `Ingest.jsx`, `Newsstand.jsx`, `Assistant.jsx`, `ArticleView.jsx`, `Notebook.jsx`, `Processing.jsx`, `Notifications.jsx`, `Settings.jsx`, `Mindmap.jsx`, `Studio.jsx`) — is the **source of truth** for layout, copy, motion, and behaviour. The current deployment dropped or simplified several components and ships only two ingest endpoints; everything else has no backend.
>
> **Do this:**
>
> **A. Restore the frontend to parity with the prototype.** Rebuild each component below to match its prototype file exactly — same DOM structure, class names, copy, and interactions. Priorities:
> 1. **Newsstand auto‑scrolling category rails** (`Newsstand.jsx` `CategoryRow` + `app.css` `.cat-row`/`.rail-track`/`@keyframes marquee`): one marquee row per desk, duplicated track translating 0→‑50% over `cat.dur` seconds, pause on hover and via the Pause/Play button, `prefers-reduced-motion` safe. Plus the Stand/Grid toggle, search, and tag‑filter bar.
> 2. **Floating Article Assistant dock** (`Assistant.jsx` `ArticleAssistant`): the bottom "Ask about this article" pill that expands into an article‑scoped chat panel; must render on every article view. Also verify the bottom mobile tab bar (`Shell.jsx` `MobileTabBar`).
> 3. **Settings → Tags admin and Saved Views admin** (`Settings.jsx` `TagsAdmin`, `ViewsAdmin`): tag search/create/inline‑rename/archive‑restore/merge‑with‑target‑picker/counts/show‑archived; and the saved‑view cards + full include/exclude facet editor (Any/All match per facet, none‑of excludes, soft delete/restore). Also restore the Ingestion, AI & Audio (incl. Aura‑2 VoicePicker + AI Gateway), and Notifications preference sections.
> 4. **Left sidebar rail** (`Shell.jsx` `Sidebar`): brand, "Add links", nav order Add‑to‑archive/Newsstand/Notebook/Studio/Processing, "Saved views" section + "New view" deep link, Settings footer, active 3px brand bar, collapse + mobile drawer.
> 5. Verify the rest match the prototype: **Article view** tabs + Source/Audio/TagEditor/Details sidebar; **Notebook** 3‑mode source panel + RAG chat; **Studio** artifact gallery + viewer + iterate; **Processing** stat cards + 5‑stage pipeline table + error expansion; **Notifications** center; **Generate modal**; **Mindmap**.
>
> **B. Build the backend APIs** the frontend needs. Use the data shapes in `data.js` verbatim (field names must match). Implement on Cloudflare: **D1** (articles, tags, article_tags, views, jobs, artifacts, notifications, settings, sessions, messages), **Vectorize** (BGE‑M3 1024‑dim chunk embeddings), **R2** (screenshots, PDFs, markdown, narration mp3, PWA bundles), **Workers AI** (Llama 3.3 70B, BGE‑M3, Llama 3.2 11B Vision, Deepgram Aura‑2), **Browser Rendering**, and **Queues + Workflows/Durable Objects** for the pipeline + live job status. Endpoints (full request/response shapes are in the spec I'm pasting after this):
> - Articles: `GET /api/articles`, `GET /api/articles/:id`, `PATCH /api/articles/:id/tags`, `DELETE /api/articles/:id`
> - Search/RAG: `GET /api/search`, `POST /api/search/semantic`
> - Chat: `POST /api/chat` (SSE, scoped retrieval + citations), `GET/POST /api/sessions`, `GET /api/sessions/:id`
> - Tags: `GET/POST /api/tags`, `PATCH /api/tags/:id`, `POST /api/tags/merge`
> - Views: `GET/POST /api/views`, `PATCH /api/views/:id`, `DELETE /api/views/:id`; view resolution via `GET /api/articles?view=`
> - Processing: `GET /api/jobs`, `GET /api/jobs/stream` (SSE), `POST /api/jobs/:id/retry`, `DELETE /api/jobs/:id`, `GET /api/stats`
> - Audio: `POST /api/articles/:id/audio`, `GET /api/articles/:id/audio`
> - Studio: `GET /api/artifacts`, `POST /api/artifacts/generate`, `GET /api/artifacts/:id`, `POST /api/artifacts/:id/iterate`, `GET /api/artifacts/:id/versions`
> - Notifications: `GET /api/notifications`, `POST /api/notifications/read`
> - Settings: `GET/PATCH /api/settings`, `GET /api/models`, `GET /api/voices`
> - Make `POST /api/ingest` and `POST /api/articles/submit` run the real pipeline (Browser Rendering → R2 → extract/OCR → summary+tags → embed → Vectorize+D1), emitting job events + notifications; keep their existing response shapes.
> - Either implement the `/mcp` server the OpenAPI description advertises, or remove that claim.
>
> **C. Wire frontend → backend.** Replace the prototype's mock arrays (`ARTICLES`, `TAGS`, `SAVED_VIEWS`, `PROC_JOBS`, `NOTIFICATIONS`, `ARTIFACTS`, etc. in `data.js`) with fetches to the above, keeping the same shapes. Keep optimistic UI for tag edits, view CRUD, notification read, and job retry. Update `openapi.json` to document every new route.
>
> **D. Verify.** Each screen loads real data with no console errors; the Newsstand rails scroll and pause; the article assistant dock appears; Settings Tags/Views admin perform real CRUD; Processing reflects live job state; ingest runs the real pipeline end‑to‑end.

*(Paste section 3 of this document immediately after the prompt as the detailed API spec.)*
