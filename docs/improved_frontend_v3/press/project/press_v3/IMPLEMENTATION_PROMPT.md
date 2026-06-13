# Press v3 — Implementation Brief for the Coding Agent

You are working in the **`press`** repo (Astro + Cloudflare Workers + Hono + Drizzle/D1, React islands under `src/frontend`). Implement the three feature areas below. A working visual reference lives in **`docs/improved_frontend_v3/`** (`index.html`, `press.css`, `press-app.jsx`, `press-data.js`) — open it and **match it pixel-for-pixel**. It is the source of truth for layout, type, spacing, colour and interaction. Do not approximate from memory.

> Why the last pass missed: the cards were styled as a generic thumbnail with a small floating `src-tab` badge. The new design is fundamentally different — **every card opens with a full-width solid-colour masthead bar** carrying the publication name twice (plain on the left, in the publication's own display font on the right). Treat the masthead as the defining element of the card, not a badge.

---

## AREA 1 — Source style profiles ("each publication always looks the same")

### 1a. Concept
Every source (`theverge.com`, `wired.com`, …) has a deterministic **style profile**: `accent` (masthead bar colour), `ink` (text colour on the bar), `short` (compact code), `bg` (paper colour for the synthetic render), and a **`face`** — the typographic personality of its wordmark. `face` is one of:

```
serif | grotesque | condensed | mono | slab
```

mapped to a font stack on the frontend:

```js
const FACE_FONT = {
  serif:     '"Newsreader", Georgia, serif',
  grotesque: '"Archivo", "Geist", sans-serif',
  condensed: '"Archivo Narrow", "Arial Narrow", sans-serif',
  mono:      '"Geist Mono", ui-monospace, monospace',
  slab:      '"Roboto Slab", Georgia, serif',
};
```

### 1b. The card masthead (frontend — the part that was missed)
Rebuild `ArticleCard` in `src/frontend/components/press/pages/Newsstand.tsx` so each card is:

```
┌───────────────────────────────────────────┐
│  The Verge                                  │  ← masthead: solid src.accent bg, src.ink text
├───────────────────────────────────────────┤     wordmark set in FACE_FONT[src.face]
│            (screenshot / render)            │     (the publication's own typeface)
├───────────────────────────────────────────┤
│  Title, two lines max                       │
│  ◷ theverge.com · 13h ago                   │
│  ● tag ● tag ● tag                          │
└───────────────────────────────────────────┘
```

The source name appears **once**, set in that publication's typeface — that single typographic treatment IS the brand signal (don't repeat the name). Key CSS (copy from `docs/improved_frontend_v3/press.css`, sections `SOURCE STYLE-PROFILE CARD` + `.masthead`): the masthead is `height:30px`, `padding:0 12px`, `background:var(--src-accent)`, `color:var(--src-ink)`, with a 2px `rgba(0,0,0,.22)` underline. The wordmark (`.mh-name`) gets per-face modifier classes (`.mh-name.serif{font-style:italic}`, `.mh-name.condensed{text-transform:uppercase}`, `.mh-name.mono{font-size:13px}`, `.mh-name.grotesque{font-weight:800}`, etc.). Pass the profile down as CSS vars on the card root:

```jsx
<div className="acard" style={{ '--src-accent': s.accent, '--src-ink': s.ink, '--src-bg': s.bg, '--src-face': FACE_FONT[s.face] }}>
  <div className="masthead">
    <span className={'mh-name ' + s.face}>{s.name}</span>
  </div>
  …
</div>
```

The screenshot thumbnail stays below the masthead (drop the old floating `.src-tab` badge entirely — the masthead replaces it). When `screenshotUrl` is missing, keep the synthetic `.render` fallback but it inherits `--src-bg`/`--src-accent` so it still reads as that publication.

Load the new fonts in `BaseLayout.astro` (or wherever Geist is loaded):
```html
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Archivo:wght@400..800&family=Archivo+Narrow:wght@500..700&family=Roboto+Slab:wght@500..800&display=swap" rel="stylesheet" />
```

### 1c. Backend — persist & serve `face`
The `sources` table and `resolveSource()` already exist; they're missing `face` and `ink`.

1. **Schema** `src/backend/db/schemas/articles/sources.ts` — add columns:
   ```ts
   /** Text colour on the accent masthead bar ("#fff" | "#000"). */
   ink: text("ink"),
   /** Typographic personality of the wordmark: serif|grotesque|condensed|mono|slab. */
   face: text("face").default("serif"),
   ```
   Generate a migration: `pnpm drizzle-kit generate` (a new file under `drizzle/`). Do **not** hand-edit existing migrations.

2. **Seed map** `src/backend/ai/ingest/resolveSource.ts` — extend each `SEED` entry with `ink` + `face`. Suggested faces: The Verge → `grotesque`, Wired → `condensed`, Ars Technica → `mono`, TechCrunch → `grotesque`, NYT / Guardian / Bloomberg-opinion → `serif`, Reuters/AP/CNBC → `slab`, MIT TR → `condensed`. For unknown hosts, derive a **stable** face by hashing the hostname into the 5-value list (so a given domain is always the same), and pick `ink` by luminance of `accent` (dark accent → `#fff`, light accent → `#111`). Persist `ink`/`face` on insert in both the seeded and auto-derived branches.

3. **Serve it** `src/backend/api/routes/articles.ts` — add `ink` and `face` to the `SourceInfo` type, to the `sourceMap.set(...)` projection, and to the `select({...})` from `sources`. (List + single-article endpoints both build `sourceInfo` from `meta.sources` — update the shared projection.) Mirror the `SourceInfo` interface in `src/frontend/components/press/PressApp.tsx`.

4. **Sources admin API (new)** add `src/backend/api/routes/sources.ts` and mount it in `src/backend/api/index.ts`:
   - `GET  /api/sources` → list all sources `{ id, key, name, accent, ink, bg, short, face, articleCount }`.
   - `PUT  /api/sources/:id` → update `{ name?, accent?, ink?, bg?, short?, face? }` so an editor can correct a publication's profile once and have it apply everywhere.
   Add an OpenAPI entry alongside the others in `routes/openapi.ts`.

5. **Frontend Sources admin (new Settings section)** add a "Sources" tab to `src/frontend/components/press/pages/Settings.tsx` listing each source as a live mini-masthead preview with editable accent (swatch), `face` (segmented control of the 5 options), `ink` (light/dark), and `short`. Reuse the masthead component so the preview is identical to the card.

---

## AREA 2 — Tags: hierarchy + camelCase + colour inheritance

### 2a. Backend
`tags` already has `name`(unique) / `description` / `color` / `hue` / `isActive` / `archived`. Add hierarchy + enforcement.

1. **Schema** `src/backend/db/schemas/articles/tags.ts` — add:
   ```ts
   /** Parent tag id for hierarchy (null = top-level). Self-referential. */
   parentId: integer("parent_id"),
   ```
   Generate a migration (`pnpm drizzle-kit generate`). `GET /api/tags` already `select()`s all columns, so `parentId` flows through automatically — just make sure the frontend type includes it.

2. **camelCase enforcement** — add a shared util and apply it server-side in `routes/tags.ts` on **both** POST and PUT before insert/update. Names are accepted as typed but stored normalised:
   ```ts
   export function toCamelCase(raw: string): string {
     const spaced = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2");          // split existing camelCase
     const words = spaced.replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(/[\s_-]+/).filter(Boolean);
     if (!words.length) return "";
     return words.map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
   }
   ```
   Uniqueness is checked against the **normalised** name (so "AI Agents", "ai agents", "aiAgents" all collide). On a POST collision, return the existing tag (current upsert behaviour).

3. **Colour inheritance** — extend the POST/PUT body to accept `parentId`, `description`, `color`, `hue`, `isActive`. When a tag has a `parentId` and the client didn't pass an explicit `color`, derive one in the parent's family:
   ```ts
   function childColor(parentHue: number, depth: number, siblingIdx: number): string {
     const L = Math.min(0.84, 0.6 + depth * 0.07 + (siblingIdx % 2) * 0.02);
     const h = parentHue + (siblingIdx * 7 - 7);
     return `oklch(${L.toFixed(2)} 0.15 ${h})`;
   }
   ```
   `depth` = chain length to root; `siblingIdx` = count of existing children of that parent. Inherit `hue` from the parent. Top-level tags keep their chosen base hue. Validate `parentId` is not the tag itself or one of its descendants (reject cycles with 400).

4. **Mark inactive (CRUD "delete")** — keep it reversible: `PUT /api/tags/:id { isActive:false }`. No hard delete. Reactivation is `isActive:true`. (Keep the legacy `archived` flag in sync if you want, but `isActive` is the canonical "retired" switch the UI uses.)

### 2b. Frontend — `TagsAdmin` in `Settings.tsx`
Replace the flat list with the **tree editor** from `docs/improved_frontend_v3/press-app.jsx` (`TagsAdmin`, `TagEditor`, `ParentSelect`). Behaviour to match exactly:

- **Tree view** (left): nested rows with depth indentation + connector guides, colour swatch, `#camelCaseName`, description, article count, collapse chevrons, per-row Edit + Mark-inactive/Reactivate. Inactive tags render at 50% opacity with an `inactive` badge; a "Show inactive tags" toggle filters them.
- **Editor panel** (right, sticky): Name field with a **live "stored as → camelCase" preview**; Description textarea; **Parent tag** picker (excludes self + descendants); **Colour** control that switches mode based on parent —
  - *no parent* → pick a base hue family (8 swatches),
  - *has parent* → 6 in-family swatches generated by `childColor(parentHue, depth, idx)`, all shades/hues of the parent's family;
- Active toggle; a final preview chip; Create/Save + Cancel + Mark-inactive buttons.
- Wire to the API: load `GET /api/tags`, build the tree from `parentId`; Create → `POST /api/tags`; Save → `PUT /api/tags/:id`; Mark inactive → `PUT /api/tags/:id {isActive:false}`. Send `name` exactly as typed (server normalises) but you may also show the normalised preview locally with the same `toCamelCase`.

---

## AREA 3 — Rails that yield to the user

The current rails use a CSS marquee (`@keyframes marquee` + `animation-play-state:paused` on hover). A CSS transform animation **cannot be grabbed and free-scrolled**. Replace it with a JS-driven auto-scroll over a **real horizontal scroll container**, exactly as in `docs/improved_frontend_v3/press-app.jsx` (`Rail` component) + `press.css` (`.rail`).

Requirements:
- `.rail` is `display:flex; overflow-x:auto` with `scroll-snap-type:x proximity`. Cards are real children; duplicate the list once for a seamless wrap when ≥4 cards.
- A `requestAnimationFrame` loop advances the rail ~0.45px/frame. **Important:** keep the position as a JS float in a ref and assign it — do **not** do `el.scrollLeft += 0.45`, because `scrollLeft` reads back integer-rounded so the fractional step is discarded every frame and the rail never moves. Pattern:
  ```js
  // when the loop starts: st.pos = el.scrollLeft;
  // each frame (when not paused): st.pos += 0.45;
  //   if (seamless && st.pos >= el.scrollWidth/2) st.pos -= el.scrollWidth/2;
  //   el.scrollLeft = st.pos;
  // while paused / hovered / user-scrolling: st.pos = el.scrollLeft;  // re-sync
  ```
  Re-sync `st.pos = el.scrollLeft` on every user wheel / touch / drag-end too, so auto-advance resumes from where the user left it.
- **User takes over**: on `wheel`, `touchstart`, `touchmove`, or pointer-drag, set an `idleUntil = now + 2600ms` window during which the auto-advance pauses. Native scroll/touch works because it's a real scroller. After the idle window with no interaction, auto-advance resumes.
- **Desktop drag-to-scroll**: pointer-down captures `startX`/`startScroll`; pointer-move sets `scrollLeft = startScroll - dx`; suppress the card's click if the pointer moved >4px (so dragging never opens an article). Add `.dragging` class (sets `cursor:grabbing`, disables snap).
- Respect `prefers-reduced-motion: reduce` (no auto-advance, manual scroll only) and the global **Pause rows** button.
- Works on mobile (touch) and desktop (wheel + drag) identically.

---

## Acceptance criteria
1. Every Newsstand card leads with a solid-colour masthead carrying the publication name **once**, set in that publication's `face` typeface. The Verge, Wired, Ars Technica, NYT etc. are each visibly distinct and **consistent across every card from that source**.
2. A source's profile (`accent`/`ink`/`short`/`face`) is editable in Settings → Sources and persists via `PUT /api/sources/:id`; new ingests get a stable auto-derived `face`/`ink`.
3. Tags are a hierarchy: create under a parent, names auto-normalise to camelCase server-side, child colours are auto-derived as a different hue/shade of the parent's family, and tags are marked inactive (reversible) rather than deleted.
4. Rails auto-scroll but can be grabbed/scrolled by wheel, touch, or drag on both desktop and mobile, then resume after ~2.6s idle; reduced-motion and Pause-rows are honoured.
5. Run `pnpm drizzle-kit generate` for the two new migrations (sources `ink`+`face`, tags `parent_id`); apply with your normal D1 migrate step. No existing migration files are edited.

## Files you will touch
- `drizzle/00XX_*.sql` (generated ×2)
- `src/backend/db/schemas/articles/sources.ts`, `…/tags.ts`
- `src/backend/ai/ingest/resolveSource.ts`
- `src/backend/api/routes/articles.ts`, `routes/tags.ts`, **new** `routes/sources.ts`, `routes/openapi.ts`, `api/index.ts`
- `src/frontend/components/press/pages/Newsstand.tsx`
- `src/frontend/components/press/pages/Settings.tsx` (Tags rewrite + new Sources section)
- `src/frontend/components/press/PressApp.tsx` (SourceInfo type)
- `src/frontend/styles/press.css` (masthead, `.rail`, tag-tree, editor — port from the v3 reference)
- `src/frontend/layouts/BaseLayout.astro` (font links)
