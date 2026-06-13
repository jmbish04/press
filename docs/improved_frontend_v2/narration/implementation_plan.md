# Kimi K2.6 Structured Extraction + Article Images Pipeline

## Problem

Three issues with [cleanContent.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/cleanContent.ts):

1. **It slices content to 8K chars** — losing article tail for long pieces
2. **It uses Llama 3.1 8B** (`MODELS.extract`) — too small for structured extraction at full article length
3. **It's a free-text completion** — no schema enforcement, no image awareness

Additionally, articles currently have no inline images in the Reader. Meaningful article images should be extracted during ingestion, uploaded to Cloudflare Images, and displayed inline.

> [!IMPORTANT]
> **`rawContent` is NEVER modified.** It stays as the full `document.body.innerText` in D1. The Kimi extraction produces a `cleanContent` that the Reader displays separately.

---

## Proposed Changes

### 1. AI Gateway — Add Kimi K2.6 model

#### [MODIFY] [gateway.ts](file:///Volumes/Projects/workers/press/src/backend/ai/gateway.ts)

Add `kimi` model ID to the `MODELS` constant:

```ts
export const MODELS = {
  chat: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  extract: "@cf/meta/llama-3.1-8b-instruct",
  /** Kimi K2.6 — 262K context, structured output, used for content extraction. */
  kimi: "@cf/moonshotai/kimi-k2.6",
  embedding: "@cf/baai/bge-large-en-v1.5",
  generate: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
} as const;
```

---

### 2. Rewrite cleanContent.ts → extractArticle.ts

#### [DELETE] [cleanContent.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/cleanContent.ts)

#### [NEW] `src/backend/ai/ingest/extractArticle.ts`

Single Kimi K2.6 call with `response_format: { type: "json_schema" }` that replaces both the old extract step AND the clean step. Sends the **full** `rawContent` (no slicing — Kimi has 262K context). Returns:

```ts
interface ArticleExtraction {
  author: string;             // empty string if unknown
  datePublished: string;      // ISO 8601 or empty
  articleTitle: string;       // headline
  summary: string;            // 2-3 sentence summary
  topic: string;              // primary subject category
  source: string;             // publication name
  articleContent: string;     // cleaned article body (nav/ads/comments stripped)
  imagePlacements: Array<{
    position: number;         // paragraph index (0-based) where this image appeared
    altText: string;          // descriptive alt text
    caption: string;          // image caption if present
    originalSrc: string;      // original <img> src URL from the page
  }>;
}
```

The JSON schema enforced via `response_format`:

```ts
const ARTICLE_EXTRACTION_SCHEMA = {
  name: "article_extraction",
  schema: {
    type: "object",
    properties: {
      author:         { type: "string" },
      datePublished:  { type: "string" },
      articleTitle:   { type: "string" },
      summary:        { type: "string" },
      topic:          { type: "string" },
      source:         { type: "string" },
      articleContent: { type: "string" },
      imagePlacements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            position:    { type: "integer" },
            altText:     { type: "string" },
            caption:     { type: "string" },
            originalSrc: { type: "string" },
          },
          required: ["position", "altText", "originalSrc"],
        },
      },
    },
    required: ["articleTitle", "articleContent", "imagePlacements"],
  },
};
```

System prompt tells Kimi to:
- Return the full article body as `articleContent`, stripping nav/footer/cookie/share/comment boilerplate
- Identify meaningful article images (hero, inline photos, diagrams) and their positions as paragraph indices
- Exclude ad images, tracking pixels, social icons, avatars, and decorative spacers
- Preserve author byline, published date, and headline verbatim from the article

---

### 3. Image extraction in the render step (Puppeteer)

During the Puppeteer render step (Step 2 in the Workflow), before closing the page:

1. **Evaluate** `document.querySelectorAll('img')` and collect `{ src, alt, width, height, naturalWidth, naturalHeight }` for every `<img>`
2. **Filter** out junk:
   - `naturalWidth < 100 || naturalHeight < 100` (tracking pixels, icons)
   - `src` contains `ad`, `pixel`, `tracker`, `beacon`, `analytics`, `doubleclick`, `facebook.com/tr`, `googlesyndication`
   - `src` is a `data:` URI under 5KB (inline spacer GIFs)
   - `alt` contains "advertisement", "sponsored", "ad"
3. **Return** the filtered image list alongside `textContent`, `screenshotKey`, etc.

---

### 4. New `article_images` table

#### [NEW] `src/backend/db/schemas/articles/article_images.ts`

```ts
export const articleImages = sqliteTable("article_images", {
  id:         integer("id").primaryKey({ autoIncrement: true }),
  articleId:  integer("article_id").notNull().references(() => articles.id),
  imageName:  text("image_name").notNull(),     // descriptive name from alt/caption
  imageCfUrl: text("image_cf_url").notNull(),   // Cloudflare Images delivery URL
  position:   integer("position"),               // paragraph index for inline placement
  caption:    text("caption"),                   // image caption if present
  createdAt:  integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
```

#### [MODIFY] [articles/index.ts](file:///Volumes/Projects/workers/press/src/backend/db/schemas/articles/index.ts)

Export the new table.

---

### 5. Image upload helper

#### [NEW] `src/backend/ai/ingest/uploadImage.ts`

Uploads an image to Cloudflare Images via the REST API (using `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` from Secrets Store):

```ts
export async function uploadImageToCF(
  env: Env,
  imageUrl: string,
  metadata?: { articleId: number; imageName: string },
): Promise<string | null>  // returns the CF Images delivery URL or null on failure
```

The function:
1. POSTs `{ url: imageUrl }` to `https://api.cloudflare.com/client/v4/accounts/{id}/images/v1`
2. Extracts `result.variants[0]` (the public delivery URL)
3. Returns it, or `null` if the image is unreachable / upload fails

---

### 6. New pipeline step in the Workflow

Current workflow steps 3 (extract) + 4 (clean) collapse into a single **step 3 (extract+clean)** using `extractArticle()`. A new **step 4 (images)** handles image upload.

#### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)

| Old Step | New Step | What changes |
|----------|----------|-------------|
| 3. extract (Llama 8B json_schema) | 3. extract (Kimi K2.6 structured) | Single call returns metadata + cleanContent + imagePlacements |
| 4. clean (Llama 8B free-text, sliced) | **Removed** — merged into step 3 | — |
| — | 4. images (new) | Cross-reference Puppeteer img list with Kimi imagePlacements, upload to CF Images, insert `article_images` rows |
| 5→ embed | 5. embed | Uses `extraction.articleContent` (cleaned) for chunking |

**Image step logic:**
1. Take `renderResult.pageImages` (from Puppeteer) and `extraction.imagePlacements` (from Kimi)
2. Match by `originalSrc` — if Kimi identified an image as meaningful AND Puppeteer captured it, it's a keeper
3. Upload each keeper to Cloudflare Images via `uploadImageToCF()`
4. Insert rows into `article_images` with position, caption, imageName

#### [MODIFY] [processArticle.ts](file:///Volumes/Projects/workers/press/src/backend/ai/ingest/processArticle.ts)

Same changes for parity — replace the old extract + clean calls with `extractArticle()`, add image extraction during the Puppeteer step, upload + insert.

---

### 7. API — Serve article images

#### [MODIFY] [articles.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/articles.ts)

In `GET /api/articles/:id`, join `article_images` and return an `images` array:

```ts
images: [
  { id: 1, imageName: "hero image", imageCfUrl: "https://imagedelivery.net/...", position: 0, caption: "..." },
  ...
]
```

---

### 8. Frontend — Inline images in the Reader

#### [MODIFY] [ArticleView.tsx](file:///Volumes/Projects/workers/press/src/frontend/components/press/pages/ArticleView.tsx)

In the Reader tab, when rendering `cleanContent` paragraphs, insert `<img>` elements at the positions specified by `article_images.position`:

```tsx
// Split cleanContent into paragraphs, interleave images at their positions.
const paragraphs = readerContent.split("\n\n");
const imagesByPosition = new Map(images.map(img => [img.position, img]));

{paragraphs.map((p, i) => (
  <React.Fragment key={i}>
    {imagesByPosition.has(i) && (
      <figure className="reader-img">
        <img src={imagesByPosition.get(i)!.imageCfUrl} alt={imagesByPosition.get(i)!.imageName} />
        {imagesByPosition.get(i)!.caption && <figcaption>{imagesByPosition.get(i)!.caption}</figcaption>}
      </figure>
    )}
    <p>{p}</p>
  </React.Fragment>
))}
```

#### [MODIFY] [press.css](file:///Volumes/Projects/workers/press/src/frontend/styles/press.css)

Add `.reader-img` styles for inline article images with caption.

---

### 9. Narration — full article audio from clean content (no slicing)

Three places currently truncate to 5000 chars: the narrate endpoint, the Workflow audio step, and the backfill audio. All three must be rewritten.

#### [NEW] `src/backend/ai/ingest/narrateFullArticle.ts`

Shared helper used by all three call sites. Logic:

```ts
export async function narrateFullArticle(
  env: Env,
  cleanContent: string,
  voice: string,
): Promise<ArrayBuffer>
```

**How it works:**

1. **Input:** Takes `cleanContent` (the Kimi-cleaned article body, NOT rawContent). This ensures the TTS never reads nav junk, cookie banners, or "Skip to main content".

2. **Chunk by paragraph** — split on `\n\n`, accumulate paragraphs into ~4000 char batches (well within Aura-2's safe zone). Never cut mid-sentence — chunk on paragraph boundaries.

3. **Generate audio per chunk** — for each batch, call `env.AI.run("@cf/deepgram/aura-2-en", { text, voice })`. Each returns a WAV `ArrayBuffer`.

4. **Merge WAV buffers** — WAV files share the same sample rate / bit depth / channels from Aura-2. To concatenate:
   - Read the WAV header (44 bytes) from the first chunk's output
   - Extract raw PCM data (bytes 44+) from each chunk
   - Concatenate all PCM payloads
   - Write a new WAV header with the updated `dataSize` and `fileSize`
   - Return the merged `ArrayBuffer`

5. **Result:** A single WAV file covering the **full** article. No content is missed.

#### [MODIFY] [narration.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/narration.ts)

Replace L466–478 (the `slice(0, 5000)` + single `AI.run` call) with:

```ts
const audioBytes = await narrateFullArticle(c.env, contentForNarration, voice);
```

> [!WARNING]
> The narrate endpoint must use `cleanContent` **exclusively** — fall back to `rawContent` ONLY if `cleanContent` is null. This means Kimi extraction must run before narration. The endpoint should check `article.cleanContent` first and return an error ("Article has not been cleaned yet — run ingestion first") if both are null.

#### [MODIFY] [ArticleIngestionWorkflow.ts](file:///Volumes/Projects/workers/press/src/backend/workflows/ArticleIngestionWorkflow.ts)

Replace L586 (`slice(0, 5000)` + single call) with:

```ts
const textForNarration = extraction.articleContent; // clean output from Kimi step 3
const audioBytes = await narrateFullArticle(this.env, textForNarration, voice);
```

The Workflow audio step now uses the Kimi-extracted `articleContent` directly — zero junk.

#### [MODIFY] [backfill.ts](file:///Volumes/Projects/workers/press/src/backend/api/routes/backfill.ts)

Replace L157–178 (`slice(0, 5000)` + single call) with:

```ts
const content = row.cleanContent || row.rawContent;
const audioBytes = await narrateFullArticle(c.env, content, voice);
```

---

## Open Questions

> [!IMPORTANT]
> **Cloudflare Images plan:** Does your account have Cloudflare Images enabled? If not, we could store images in the existing R2 bucket (`SPAWNED_PWAS`) and serve via `/artifacts/*` instead — same result, no extra service. Which do you prefer?

> [!IMPORTANT]
> **Kimi K2.6 token budget:** At 262K context Kimi can handle any article. However, the `articleContent` field in the response will also consume output tokens. Should we set `max_completion_tokens` to a generous value (e.g. 16384) or leave it unbounded?

---

## Verification Plan

### Automated
```bash
pnpm run db:generate   # new migration for article_images
pnpm run build         # TypeScript + Astro build clean
```

### Manual
1. Ingest a long article (>8000 chars) — confirm `cleanContent` contains the full cleaned body (no truncation)
2. Confirm `rawContent` is unchanged (full `innerText`)
3. Verify `article_images` rows are created with valid CF Images URLs
4. Open ArticleView Reader tab — confirm images render inline at correct positions
5. Confirm junk images (ads, pixels) are NOT in the `article_images` table
6. **Narration:** Generate audio for a long article — play it back, confirm it covers the **entire** article (not just the first 5K chars)
7. **Narration quality:** Confirm audio reads clean prose — no nav menus, no "Skip to content", no "Toggle dark mode"
8. **WAV merge:** Verify the output is a valid single WAV file (no glitches at chunk boundaries)

