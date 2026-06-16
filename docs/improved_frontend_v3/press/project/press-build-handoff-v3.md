# Press — Targeted Build Handoff (v3)

Reviewed against the actual repo (`press/`). v3 adds detailed, file‑referenced instructions for the processing‑pipeline requirements from your notes (screenshots, per‑source color profiles, audio with the configured voice, default PDF + mind map, markdown trimming, author/published‑date extraction, and RAG embeddings), on top of the v2 gaps.

---

## 0. First: the deployment is stale

Most of what looked missing on `press.hacolby.workers.dev` is **already in the codebase**, just not shipped: Settings Tags + Saved‑Views admin (`pages/Settings.tsx`), the floating Article Assistant dock (mounted in `pages/ArticleView.tsx`), the Newsstand rails, and an 8‑step ingestion workflow. The deployed `openapi.json` showing only `/api/ingest` is a red herring — `app.doc()` only documents zod‑`createRoute` routes; the real routers are mounted via `app.route()` in `src/backend/api/index.ts`.

**Action 0: rebuild and redeploy `main`, then re‑review.** Then close the genuine gaps below.

---

## 1. Two ingestion code paths — read this first

There are **two** pipelines and changes generally must land in **both** (or you should consolidate to one):

- **`src/backend/workflows/ArticleIngestionWorkflow.ts`** — the Cloudflare **Workflow** wired to `POST /api/ingest` (`api/index.ts`). 8 steps: fetch → render → extract → embed → index → tags → mindmap → audio. This one already generates screenshot, PDF, mind map, and audio.
- **`src/backend/ai/ingest/processArticle.ts`** — used by the bulk loop and the `IngestAgent` Durable Object. It only does **render → screenshot → extract → embed → upsert**. It does **not** generate PDF, mind map, or audio, and does **not** persist properties the same way.

**Decide on one canonical path** (the Workflow is the more complete one) and either route everything through it or bring `processArticle.ts` to parity. Every instruction below should be applied to the canonical path(s).

---

## 2. Processing‑pipeline requirements (your notes)

### 2.1 Screenshot → newsstand card image, with rendered fallback
**Mostly done — verify and unify.** Both paths capture a JPEG to R2 (`processArticle.ts` → `screenshots/{id}.jpg`; workflow → `screenshots/wf-{jobId}.jpg`) inside a try/catch, leaving `screenshotKey` unset on failure. `routes/articles.ts` exposes it as `screenshotUrl = /artifacts/{key}`, and `pages/Newsstand.tsx` already renders `<img src={screenshotUrl}>` with a synthetic CSS render fallback.
- Confirm the **workflow** persists its `screenshotKey` to the article row (it builds the key but make sure the D1 update always runs even if later steps fail).
- Standardize the key (`screenshots/{articleId}.jpg`) so the backfill and detail endpoints agree.
- Keep the rendered fallback in Newsstand, but tint it with the **source color** (see 2.2) rather than the current `oklch(0.5 0.12 ${(article.id*47)%360})` random hue.

### 2.2 Per‑source config + auto color profile — **new feature**
There is **no sources table** today; `source` is only an AI‑extracted text property, and Newsstand colors cards by a random hash of the article id. Build source identity so users can distinguish publications (The Verge, Wired, …) at a glance.

- **New table `sources`** (Drizzle migration): `id`, `key` (slug, e.g. `theverge.com` or `verge`), `name` (display, e.g. "The Verge"), `accent` (hex/oklch), `bg`, `short` (badge text), `createdAt`.
- **During processing**, after render/extract: resolve the source from the article's hostname (+ extracted `source` name). If no `sources` row exists for that host, **create one and derive a color profile from the scraped page**:
  - In the Browser Rendering step, while the page is open, sample brand styling — e.g. read the CSS custom properties / `theme-color` meta / the computed `background-color` and `color` of the masthead/header/primary link, or the dominant accent from the logo. Pick a representative accent + background, convert to the token format, and store on the `sources` row.
  - Cache by host so each source is configured once; later articles reuse it.
- **Expose** the resolved source (name + accent + short) on `GET /api/articles` and `/:id` (join `sources` by host), and **apply the accent** in `pages/Newsstand.tsx` (`.src-tab` badge + the synthetic render `--src-accent`/`--src-bg`) and in `ArticleView.tsx`'s source card. Seed a few well‑known profiles (Verge `#5200ff`, Wired `#000`, Ars `#ff4e00`, etc.) so common sources look right immediately.

### 2.3 Audio readout with the **configured** voice
Both the workflow audio step and `routes/narration.ts` (`narrate`) hardcode `voice: "asteria"`. The configured voice lives in the **preferences** key‑value store (`routes/preferences.ts`, key e.g. `narration_voice`), set from Settings → AI & Audio.
- In the workflow's audio step and the `narrate` endpoint default, **read `narration_voice` from preferences** (fallback to `asteria` if unset) before calling `env.AI.run("@cf/deepgram/aura-2-en", { text, voice })`.
- Keep saving WAV to R2 (`audio/article-{id}.wav`) and setting `articles.audioKey`. Ensure `processArticle.ts` also generates audio if it remains a live path.

### 2.4 PDF + mind map generated by default
The **workflow** already renders a PDF (`pdf/wf-{jobId}.pdf` → `articles.pdfKey`) and a mind map (`articles.mindmapKey` + inline `mindmapData`), and `routes/articles.ts` serves both (with on‑demand PDF fallback and D1‑inline mindmap fast path). Gaps:
- `processArticle.ts` does **not** generate either — bring it to parity or route through the workflow.
- Older rows predate these steps → **backfill** (2.8). Confirm `pages/ArticleView.tsx` PDF and Mind‑map tabs render from `/api/articles/:id/pdf` and `/:id/mindmap` (they do).

### 2.5 Audio player in the article viewport — verify
`pages/ArticleView.tsx` already has a native `<audio controls src={audioUrl}>` in the side panel, with a "Generate audio" fallback that POSTs `/api/articles/:id/narrate`. Once 2.3 + backfill land, audio should appear automatically for every article. Just confirm it streams (`GET /api/articles/:id/audio`).

### 2.6 Trim markdown so Reader starts at real content — **new step**
`rawContent` is the raw `document.body.innerText`, so the Reader opens with nav chrome ("Skip to main content … Toggle dark mode … 5 Comments"). Add an AI cleanup step during extract:
- After capturing `textContent`, call Workers AI to **return cleaned article markdown** — strip nav/menus/cookie/share/comment boilerplate from the top and bottom, keep the article body, preserve headings/paragraphs.
- **Keep the entire article text in D1** (your note: "store the entire article text in d1 as well"). So **do not overwrite `rawContent`** — add a new `articles.cleanContent` (or `markdown`) column for the trimmed version and have the Reader/Markdown tabs prefer it, falling back to `rawContent`. This satisfies both the clean‑Reader UX and full‑text retention.
- Embed the **cleaned** content for better RAG quality (2.8), while `rawContent` remains the canonical full text in D1.

### 2.7 Extract author + published date, and show them in Reader
`EXTRACTION_SCHEMA` (`processArticle.ts`) extracts `source, author, topic, title, summary` — **`author` is captured but never displayed**, and **`publishedDate` isn't extracted**.
- Add `publishedDate` (and confirm `author`) to the extraction schema; prompt the model to read the article's byline/dateline; store as article properties.
- In `pages/ArticleView.tsx` Reader byline, show **author** and the **published date** (from properties) instead of `createdAt` (the processing date). Fall back to `createdAt` only when no published date was found.

### 2.8 RAG embeddings: `rag_uuid` + full‑content chunking
Today both paths embed only `textContent.slice(0, 2000)` → **one** vector per article, keyed by `String(articleId)` with `metadata: { url }`. There is **no `rag_uuid`**.
- Add **`rag_uuid TEXT`** to `articles` (migration); set at ingest.
- **Chunk** the cleaned content (~512–1000 tokens + overlap), embed each chunk (BGE‑M3), and upsert one vector per chunk with `metadata: { rag_uuid, articleId, chunkIndex, url }`.
- Delete the temporary `pending-${jobId}` vector after the real upsert (workflow embed step leaves orphans).
- Point the Notebook/article RAG retrieval (`src/backend/ai/rag/articleRag.ts`, `ArticleChatAgent`) at the new metadata so chat and general search read full‑article chunks.

### 2.9 Backfill existing articles (idempotent, resumable)
Write a job that iterates all `articles` and fills anything missing: `cleanContent`, `author`/`publishedDate` properties, `screenshotKey`, `pdfKey`, `mindmapKey`/`mindmapData`, `audioKey` (configured voice), `rag_uuid`, per‑chunk vectors, and a resolved `sources` row + color. Make it idempotent and resumable (skip rows already complete).

**On Python vs. binding access (your note prefers a Python script):** most of the heavy backfill steps — screenshot, PDF, mind map, audio (Aura‑2), and embeddings — require **Workers bindings** (Browser Rendering, Workers AI, Vectorize) that a standalone Python process cannot call directly. Two workable shapes:
- **Recommended:** add a guarded **admin backfill endpoint/route inside the Worker** (TS, full binding access) that processes one article (or a small batch) per call and reports what it filled. Then a **Python orchestrator** can do exactly what you described — page through `GET /api/articles`, and for each incomplete row `POST /api/admin/backfill/{id}` — with retries/resume. You get your Python driver; the binding‑bound work stays in the Worker.
- **Pure‑Python alternative (partial only):** Python can backfill the D1‑only fields it can compute without bindings (e.g. `rag_uuid` generation, property cleanup) via the Cloudflare D1 HTTP API, but it still can't render/synthesize/embed — so the admin‑endpoint approach is cleaner end‑to‑end.

---

## 3. Other frontend gaps (from v2)

- **Article‑view tag editing** (`pages/ArticleView.tsx`): tags are read‑only chips. Add removable chips, an "Add tag" multiselect of existing tags excluding applied ones (reuse `Settings.tsx`'s `TagMulti`), and a "Create new tag" modal (**name, description, color**). Persist via `PUT /api/tags/article/:id` (+ `POST /api/tags`). **Backend:** add `description` to `CreateTagBody` in `routes/tags.ts` (the column already exists).
- **Notifications bell/center**: `PressApp.tsx` hard‑codes `unreadCount = 0` with no handler; `/api/notifications` exists. Wire real count + a center popover (mark‑all‑read, error→Processing deep links).
- **Newsstand rails grouping**: currently top‑tags‑by‑frequency vs the reference's fixed category desks (hue + "Browse all" + per‑desk speed). Confirm intent with the user.
- **Optional parity:** Tags‑admin **Merge** (+ `POST /api/tags/merge`), and a **Deleted/restore** group in Saved Views (`restore()` exists but isn't surfaced).

---

## 4. Prompt to paste into your coding agent

> **Context:** Press repo (Astro + Cloudflare Workers + Hono + Drizzle/D1 + Vectorize + R2 + Workers AI + Browser Rendering + Workflows). `main` is more complete than the deployed site. Note there are **two ingestion paths** — `src/backend/workflows/ArticleIngestionWorkflow.ts` (wired to `/api/ingest`, the more complete one) and `src/backend/ai/ingest/processArticle.ts` (bulk/IngestAgent). Pick the Workflow as canonical and bring everything through it (or update both consistently).
>
> **0. Deploy & verify** current `main`; confirm which items are already satisfied before building.
>
> **1. Source color profiles.** Add a `sources` table (`key`, `name`, `accent`, `bg`, `short`). During processing, resolve the source by hostname; if absent, create it and **derive a color profile from the scraped page** (theme‑color meta / masthead computed colors / logo accent) captured during Browser Rendering. Seed common publications. Join sources into `GET /api/articles` + `/:id` and apply the accent on Newsstand cards (`.src-tab` + synthetic render `--src-accent`/`--src-bg`) and the ArticleView source card.
>
> **2. Screenshot as card image.** Ensure the canonical path always persists `screenshotKey` (key `screenshots/{articleId}.jpg`); keep Newsstand's rendered fallback but tint it with the source accent instead of the random hue.
>
> **3. Audio with configured voice.** Read `narration_voice` from preferences (fallback `asteria`) in the workflow audio step and the `narrate` endpoint; synthesize via `@cf/deepgram/aura-2-en`, save WAV to R2, set `audioKey`. Confirm the ArticleView `<audio>` player streams it.
>
> **4. Default PDF + mind map.** Ensure every processed article gets a PDF (`pdfKey`) and mind map (`mindmapKey` + inline `mindmapData`) — already in the Workflow; add to `processArticle.ts` if it stays live. Confirm the PDF and Mind‑map tabs render.
>
> **5. Clean Reader content.** Add an AI step that trims nav/boilerplate from the extracted text and returns clean article markdown. **Keep `rawContent` (full text) intact in D1** and store the trimmed version in a new `cleanContent` column; Reader/Markdown tabs prefer `cleanContent`, fall back to `rawContent`. Example junk to strip: "Skip to main content … Toggle dark mode … N Comments".
>
> **6. Author + published date.** Add `author` (confirm) and `publishedDate` to the extraction schema; store as properties; show author + published date in the Reader byline (fallback to `createdAt`).
>
> **7. RAG embeddings.** Add `articles.rag_uuid` (migration), set at ingest. Replace the `slice(0,2000)` single embedding with chunked embeddings of the cleaned content (BGE‑M3); upsert one vector per chunk with `metadata: { rag_uuid, articleId, chunkIndex, url }`; delete the temp `pending-${jobId}` vector. Update `ai/rag/articleRag.ts` retrieval accordingly.
>
> **8. Article‑view tag editing.** Editable tags (remove + multiselect of existing‑minus‑applied) + "Create tag" modal (name/description/color); persist via `PUT /api/tags/article/:id` and `POST /api/tags` (add `description` to `CreateTagBody`).
>
> **9. Notifications bell** wired to `/api/notifications`.
>
> **10. Backfill.** Make existing articles whole (your note: backfill pdf/audio/mind map + full text + `rag_uuid`). Add a guarded **admin backfill route inside the Worker** (TS, binding access) that completes one article per call, then drive it from a **Python orchestrator** that pages `GET /api/articles` and `POST`s the backfill for each incomplete row (idempotent, resumable). It fills `cleanContent`, author/published date, screenshot, pdf, mind map, audio (configured voice), `rag_uuid`, chunk vectors, and source color.
>
> **Verify:** `pnpm tsc --noEmit` + `pnpm build` clean; new and backfilled articles all carry source color, screenshot, clean Reader text with author + published date, PDF, mind map, audio, and full‑text chunk vectors with `rag_uuid`; Newsstand cards are color‑coded by source; article tag editing and the notifications bell work.

---

## 5. Done vs. remaining

| Item | Status |
|---|---|
| Screenshot capture + Newsstand `<img>` w/ fallback | ✅ present — unify key, tint fallback by source |
| Per‑source color profiles (`sources` table) | ❌ new build |
| Audio via Aura‑2 | ✅ generated — ❌ uses hardcoded voice, not settings |
| PDF generated by default | ✅ Workflow — ❌ not in `processArticle.ts`; backfill old rows |
| Mind map generated by default | ✅ Workflow — ❌ same caveats |
| ArticleView audio player | ✅ present |
| Trim Reader markdown (AI) | ❌ new step |
| Extract author | ⚠️ extracted, not displayed |
| Extract published date | ❌ not extracted; Reader shows processed date |
| RAG embeddings (full content) | ❌ only first 2000 chars, no `rag_uuid` |
| Full article text in D1 | ✅ `rawContent` stored — keep it; add `cleanContent` for Reader |
| Article tag editing UI | ❌ read‑only |
| `POST /api/tags` description | ❌ missing field |
| Notifications bell/center | ❌ stubbed |
| Settings Tags/Views admin, Assistant dock | ✅ done |
