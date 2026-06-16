# Press — Targeted Build Handoff (v2, reviewed against the actual codebase)

This replaces the earlier handoff, which was written before I had the source. Having read the real repo (`press/`), the picture is very different — and better — than the live site suggested.

---

## 0. TL;DR — the deployment is stale

**Most of what looked "missing" on `press.hacolby.workers.dev` is already implemented in the codebase but not deployed.** Verified in source:

- **Settings → Tags admin and Saved Views admin both exist and are complete** (`pages/Settings.tsx`): tag search / create / inline‑rename / archive‑restore / counts / show‑archived, and the full saved‑view editor with Include (tags/keywords/domains, each Any/All) + Exclude facets, soft delete. *(Your "config missed tags and saved views" complaint is already fixed in code.)*
- **The floating Article Assistant dock exists and is mounted** — `ArticleAssistant` is rendered inside `pages/ArticleView.tsx` (≈L414), converted to an `@assistant-ui` modal. *(Your "doc on the bottom is missing" is already fixed in code.)*
- **Newsstand rails exist** (`pages/Newsstand.tsx`) — marquee category rows with pause/play.
- **The backend is substantial**, not two endpoints. `openapi.json` only shows `/api/ingest` because `app.doc()` (zod‑openapi) only documents routes registered via `createRoute`; every real router (`articles`, `tags`, `views`, `processing`, `notifications`, `narration`, `artifacts`, `preferences`, `threads`, `ai`…) is mounted with plain `app.route()` in `api/index.ts` and is invisible to that generator. The deployed spec is a red herring.

**So step one is simply: rebuild and redeploy `main`, then re‑review.** A chunk of your punch list will evaporate. The items below are the gaps that remain *in the code itself.*

---

## 1. Genuine frontend gaps

### 1.1 Article‑view tag editing — **highest priority** (your `todo.md` #2)
`pages/ArticleView.tsx` renders the article's tags as **read‑only chips** (the side‑panel "Tags" block, chips have `cursor: "default"`). There is no way to add, remove, or create tags from the article — which is the explicit requirement.

Build, in the side panel:
- **Removable applied tags** (× on each chip).
- **"Add tag" multiselect** — a combobox listing existing tags **excluding ones already applied**; as a tag is chosen it disappears from the available list (matches your spec). Reuse the `TagMulti` pattern already written in `Settings.tsx`.
- **"Create new tag" modal** — fields: **name, description, HTML color** (color picker / swatch). On submit, create then apply.
- Persist via the existing endpoint **`PUT /api/tags/article/:id`** (replace‑set; accepts `tagIds` and/or `tagNames`, creating unknown names on the fly) and **`POST /api/tags`** for explicit create. After save, re‑fetch the article so chips reflect server truth.

### 1.2 Notifications bell + center not wired
`PressApp.tsx` hard‑codes `unreadCount = 0` and passes no bell handler; there's no notification‑center component rendered. The backend `/api/notifications` router exists. Wire the `TopBar` bell to fetch unread count and open a center popover (mark‑all‑read, deep‑link errors → Processing), matching the prototype's `NotificationCenter`.

### 1.3 Newsstand rails don't match the prototype ("rails don't look the same")
Current rails group articles by **top tags by frequency** (`pages/Newsstand.tsx` `allTags`), with a derived duration and no "Browse all". The prototype grouped by **six fixed category desks**, each with its own **hue** (glow‑ring dot), a **"Browse all →"** affordance, and a **tuned per‑desk scroll duration**. Decide with the user: keep tag‑based rails, or restore the category‑desk model. Either way, confirm `styles/press.css` carries the `.cat-row` / `.rail-track` / `@keyframes marquee` rules and the hue‑ring `.cat-dot`.

### 1.4 Tags admin: Merge dropped (optional polish)
The prototype's Tags admin had a **Merge** mode (select ≥2 tags → "keep which tag?" → reassign + archive the rest). The TSX `TagsAdmin` omits it. Add back if you want parity; needs a backend merge endpoint (see 2.5).

### 1.5 Saved Views: deleted‑views restore not surfaced
`SavedViewsAdmin` defines `restore()` but only renders **active** views — deleted views can't be restored from the UI. Render a "Deleted" group with a Restore button (parity with the prototype).

---

## 2. Backend / data gaps (your `todo.md`)

### 2.1 `rag_uuid` does not exist (todo #3)
There is **no `rag_uuid`** anywhere. `articles` (`db/schemas/articles/articles.ts`) has `rawContent, screenshotKey, pdfKey, audioKey, mindmapKey, mindmapData` — no rag id. Vectorize vectors are keyed by `String(articleId)` with `metadata: { url }` (`ArticleIngestionWorkflow.ts` ≈L353‑360).
- Add column **`rag_uuid TEXT`** to `articles`; generate a UUID at ingest; store it on the row.
- Include **`rag_uuid`** (and `articleId`) in every Vectorize vector's `metadata` so retrieval can map chunks → article.
- New Drizzle migration in `drizzle/`.

### 2.2 Only the first 2000 chars are embedded (todo #3 — "all content indexed")
The embed step does `embed(env, textContent.slice(0, 2000))` → a **single** vector per article. To truly index all content: **chunk** the full `rawContent` (e.g. ~512–1000 tokens with overlap), embed each chunk with BGE‑M3, and upsert one vector per chunk with metadata `{ rag_uuid, articleId, chunkIndex, url }`.

### 2.3 Full article text in D1 (todo #3) — mostly done
`rawContent` **is** stored for new articles (`index` step). Remaining work is only **backfilling** older rows (see 2.4).

### 2.4 Backfill existing articles (todo #1)
New articles get screenshot/pdf/mindmap/audio via the 8‑step workflow, but rows ingested earlier are missing some of `pdfKey / audioKey / mindmapKey / mindmapData / rawContent / rag_uuid` and their chunk vectors. Write a **backfill job** (a TS script run via `wrangler` against the bindings, or a Python script hitting the API) that iterates all `articles` and, per row, fills any missing artifact (render PDF/screenshot, generate mindmap, synthesize audio, (re)embed full text with `rag_uuid`). Make it idempotent and resumable.

### 2.5 `POST /api/tags` can't accept a description (blocks 1.1's create modal)
`CreateTagBody` (`routes/tags.ts`) is `{ name, color?, hue? }` — **no `description`** (though `UpdateTagBody` and the schema have it). Add `description` to the create body and persist it, so the create‑tag modal's description field round‑trips.

### 2.6 Optional: tag merge endpoint (for 1.4)
Add `POST /api/tags/merge { sourceIds, targetId }` → repoint `article_tags` to `targetId`, archive/delete the merged tags, return updated counts.

### 2.7 Housekeeping: orphan `pending-${jobId}` vectors
The embed step upserts a temporary vector `pending-${jobId}` (≈L302) that the index step never deletes when it writes the real `articleId` vector. These accumulate in Vectorize — delete the pending id after re‑upsert, or skip the temp vector entirely and embed once in the index step.

---

## 3. Prompt to paste into your coding agent

> **Context:** You're working in the **Press** repo (Astro + Cloudflare Workers + Hono + Drizzle/D1 + Vectorize + R2 + Workers AI + Browser Rendering + Workflows). The current `main` is **more complete than the deployed site** — Settings Tags/Views admin, the floating `ArticleAssistant` (mounted in `pages/ArticleView.tsx`), the Newsstand rails, and the 8‑step ingestion workflow already exist. Note: `/openapi.json` only lists `/api/ingest` because `app.doc()` only documents zod‑`createRoute` routes; all real routers are mounted via `app.route()` in `src/backend/api/index.ts`.
>
> **Step 0 — Deploy & verify.** Build and redeploy `main`. Then walk the live app and confirm which of the items below are already satisfied; only implement what's genuinely missing.
>
> **Step 1 — Article‑view tag editing** (`src/frontend/components/press/pages/ArticleView.tsx`). Replace the read‑only Tags block in the side panel with an editor: removable applied‑tag chips; an "Add tag" multiselect that lists existing tags **excluding already‑applied ones** (remove from the list as chosen — reuse the `TagMulti` pattern from `pages/Settings.tsx`); and a "Create new tag" modal with **name, description, and HTML color**. Persist through `PUT /api/tags/article/:id` (replace‑set; accepts `tagIds`/`tagNames`) and `POST /api/tags`; re‑fetch the article after save.
>
> **Step 2 — `POST /api/tags` description** (`src/backend/api/routes/tags.ts`). Add `description` to `CreateTagBody` and persist it (schema already has the column).
>
> **Step 3 — Notifications** (`PressApp.tsx`, `TopBar`). Wire the bell to `/api/notifications`: real unread count, a center popover with mark‑all‑read and error→Processing deep links.
>
> **Step 4 — `rag_uuid` + full‑content embeddings** (`src/backend/db/schemas/articles/articles.ts`, `src/backend/workflows/ArticleIngestionWorkflow.ts`, new `drizzle/` migration). Add `rag_uuid TEXT` to `articles`, set it at ingest. Replace the single `slice(0,2000)` embedding with **chunked** embedding of the full `rawContent` (BGE‑M3, ~512–1000 tokens + overlap); upsert one Vectorize vector per chunk with `metadata: { rag_uuid, articleId, chunkIndex, url }`. Delete the temporary `pending-${jobId}` vector after the real upsert. Update the RAG retrieval (`src/backend/ai/rag/articleRag.ts`) to read the new metadata.
>
> **Step 5 — Backfill script.** Add an idempotent, resumable job that iterates all `articles` and fills any missing `rawContent`, `screenshotKey`, `pdfKey`, `mindmapKey`/`mindmapData`, `audioKey`, `rag_uuid`, and chunk vectors (render/generate as needed). Provide it as a `wrangler`‑runnable TS script (preferred, direct binding access) or a Python script over the API; document how to run it.
>
> **Step 6 — Parity polish (optional):** restore Tags‑admin **Merge** (with a `POST /api/tags/merge { sourceIds, targetId }` backend), surface a **Deleted** restore group in Saved Views, and reconcile the **Newsstand rails** with the reference (category desks w/ hues + "Browse all" + per‑desk speed, or confirm tag‑based rails are intended).
>
> **Verify:** `pnpm tsc --noEmit` clean, `pnpm build` clean; article tag add/create/remove persists; new + backfilled articles all have pdf/audio/mindmap and full‑text chunk vectors carrying `rag_uuid`; notifications bell works.

---

## 4. Quick reference — what's already done vs. remaining

| Area | Status in code |
|---|---|
| Settings Tags admin | ✅ done (`Settings.tsx`) — minus Merge |
| Settings Saved Views admin | ✅ done — minus deleted‑restore UI |
| Floating Article Assistant dock | ✅ done (`ArticleView.tsx`) |
| Newsstand rails | ✅ present; grouping differs from reference |
| 8‑step ingest (fetch→…→tags→mindmap→audio) | ✅ done (`ArticleIngestionWorkflow.ts`) |
| Article detail: pdf / audio / mindmap serving | ✅ done (`routes/articles.ts`) |
| Article **tag editing** UI | ❌ read‑only — **build it** |
| Notifications bell/center wiring | ❌ stubbed in `PressApp` |
| `rag_uuid` column + metadata | ❌ doesn't exist |
| Full‑content (chunked) embeddings | ❌ only first 2000 chars |
| Backfill of older articles | ❌ needed |
| `POST /api/tags` description | ❌ missing field |
| Tag merge / view restore UI | ⚠️ optional parity |
| Orphan `pending-*` vectors | ⚠️ cleanup |
