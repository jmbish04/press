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
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Filter scraped images to keep only meaningful editorial images.
 * Removes tracking pixels, ad images, social icons, tiny avatars, and data URIs.
 */
export function filterJunkImages(images: ScrapedImage[]): ScrapedImage[] {
  return images.filter((img) => {
    // Skip tiny images (tracking pixels, icons).
    if (img.naturalWidth < 100 || img.naturalHeight < 100) return false;

    // Skip small data URIs (spacer GIFs etc).
    if (img.src.startsWith("data:") && img.src.length < 5000) return false;

    // Skip all data URIs — we can't upload them to CF Images by URL.
    if (img.src.startsWith("data:")) return false;

    // Skip junk URL patterns.
    if (JUNK_URL_PATTERNS.some((pattern) => pattern.test(img.src))) return false;

    // Skip junk alt text.
    if (JUNK_ALT_PATTERNS.some((pattern) => pattern.test(img.alt))) return false;

    // Skip SVGs (usually icons/logos).
    if (img.src.endsWith(".svg")) return false;

    return true;
  });
}
