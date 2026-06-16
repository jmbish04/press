/**
 * @fileoverview Upload article images to Cloudflare Images.
 *
 * Credentials are resolved via `utils/secrets.ts` (Secrets Store bindings).
 * Returns the public delivery URL for the image.
 */

import { resolveCloudflareImagesCredentials } from "../../utils/secrets";

export interface UploadResult {
  /** Cloudflare Images delivery URL. */
  url: string;
  /** Cloudflare Images image ID. */
  imageId: string;
}

/**
 * Upload an image to Cloudflare Images by source URL.
 *
 * @param env Worker env bindings
 * @param imageUrl Public URL of the source image
 * @param metadata Optional metadata to attach to the image
 * @returns Upload result with delivery URL, or null on failure
 */
export async function uploadImageToCF(
  env: Env,
  imageUrl: string,
  metadata?: { articleId: number; imageName: string },
): Promise<UploadResult | null> {
  try {
    const { baseUri, apiToken } = await resolveCloudflareImagesCredentials(env);

    // Build multipart form data (CF Images API requires form upload for URL).
    const formData = new FormData();
    formData.append("url", imageUrl);

    if (metadata) {
      formData.append(
        "metadata",
        JSON.stringify({
          articleId: String(metadata.articleId),
          imageName: metadata.imageName,
        }),
      );
    }

    const response = await fetch(`${baseUri}/v1`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`CF Images upload failed (${response.status}):`, errorText);
      return null;
    }

    const result = (await response.json()) as {
      success: boolean;
      result?: {
        id: string;
        variants: string[];
      };
    };

    if (!result.success || !result.result?.variants?.length) {
      console.error("CF Images upload response missing variants:", result);
      return null;
    }

    return {
      url: result.result.variants[0],
      imageId: result.result.id,
    };
  } catch (err) {
    console.error("uploadImageToCF failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Junk image filter
// ---------------------------------------------------------------------------

/** URL patterns that indicate ad/tracking/junk images. */
const JUNK_URL_PATTERNS = [
  /doubleclick/i,
  /googlesyndication/i,
  /facebook\.com\/tr/i,
  /analytics/i,
  /pixel/i,
  /tracker/i,
  /beacon/i,
  /adserver/i,
  /ad[_-]?banner/i,
  /adsense/i,
  /taboola/i,
  /outbrain/i,
  /criteo/i,
  /amazon-adsystem/i,
  /pagead/i,
];

/** Alt text patterns that indicate junk. */
const JUNK_ALT_PATTERNS = [/advertisement/i, /sponsored/i, /^ad$/i, /tracking/i];

/** Scraped image metadata from Puppeteer. */
export interface ScrapedImage {
  src: string;
  alt: string;
  /** Caption text from an enclosing <figure><figcaption> (empty if none). */
  caption: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  /** True if the image lives inside the article body (<article>/<main>/etc). */
  inArticle: boolean;
  /** True if the image lives in site chrome (header/nav/footer/aside). */
  inChrome: boolean;
}

/**
 * Filter scraped images to keep only meaningful editorial images.
 *
 * Editorial images are identified primarily by whether they carry a caption
 * (a <figcaption>), which is the cleanest signal of a "real" article image vs.
 * an ad, icon, avatar, or tracking pixel. Large in-article images and large
 * hero images are also kept. Everything in the site chrome is dropped.
 */
export function filterJunkImages(images: ScrapedImage[]): ScrapedImage[] {
  const seen = new Set<string>();

  return images.filter((img) => {
    const src = (img.src || "").trim();
    if (!src || seen.has(src)) return false;

    // Can't upload data URIs to Cloudflare Images by URL.
    if (src.startsWith("data:")) return false;
    // Skip SVGs (usually icons/logos).
    if (/\.svg(\?|#|$)/i.test(src)) return false;
    // Skip known ad / tracking / pixel URL patterns.
    if (JUNK_URL_PATTERNS.some((pattern) => pattern.test(src))) return false;
    // Skip junk alt text ("advertisement", "sponsored", …).
    if (JUNK_ALT_PATTERNS.some((pattern) => pattern.test(img.alt))) return false;
    // Drop anything in the header / nav / footer / sidebar.
    if (img.inChrome) return false;

    const hasCaption = (img.caption || "").trim().length > 0;
    const big = img.naturalWidth >= 200 && img.naturalHeight >= 200;
    const hero = img.naturalWidth >= 600 && img.naturalHeight >= 300;

    // Keep: captioned images (strongest editorial signal), large in-article
    // images, or large hero images that sit outside an explicit <article>.
    if (!(hasCaption || (big && img.inArticle) || hero)) return false;

    seen.add(src);
    return true;
  });
}
