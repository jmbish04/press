/**
 * @fileoverview Secret helpers for the Press worker.
 *
 * All secrets come from Cloudflare Secrets Store bindings defined in
 * `wrangler.jsonc`. This module provides typed async accessors so callers
 * don't need to deal with the `SecretsStoreSecret.get()` API directly.
 *
 * Bindings used here:
 *   - CLOUDFLARE_ACCOUNT_ID   → Cloudflare account ID
 *   - CLOUDFLARE_API_TOKEN    → API token (Images, etc.)
 */

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Read a Secrets Store binding value. Returns empty string on missing/error. */
async function readSecret(
  secret: SecretsStoreSecret | null | undefined,
): Promise<string> {
  if (!secret) return "";
  try {
    return (await secret.get())?.trim() || "";
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Account ID
// ---------------------------------------------------------------------------

/** Resolve the Cloudflare account ID from the Secrets Store binding. */
export async function getCloudflareAccountId(env: Env): Promise<string> {
  const value = await readSecret(env.CLOUDFLARE_ACCOUNT_ID);
  if (!value) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID secret is not configured.");
  }
  return value;
}

// ---------------------------------------------------------------------------
// API Token
// ---------------------------------------------------------------------------

/**
 * Resolve the Cloudflare API token from the Secrets Store binding.
 *
 * This token is used for Cloudflare Images uploads and any other
 * Cloudflare REST API calls.
 */
export async function getCloudflareApiToken(env: Env): Promise<string> {
  const value = await readSecret(env.CLOUDFLARE_API_TOKEN);
  if (!value) {
    throw new Error("CLOUDFLARE_API_TOKEN secret is not configured.");
  }
  return value;
}

// ---------------------------------------------------------------------------
// Cloudflare Images
// ---------------------------------------------------------------------------

const CF_IMAGES_API = "https://api.cloudflare.com/client/v4/accounts";

/**
 * Build the Cloudflare Images API base URI for this account.
 *
 * Returns: `https://api.cloudflare.com/client/v4/accounts/{accountId}/images`
 */
export async function getCloudflareImagesBaseUri(env: Env): Promise<string> {
  const accountId = await getCloudflareAccountId(env);
  return `${CF_IMAGES_API}/${accountId}/images`;
}

/**
 * Resolve all credentials needed for a Cloudflare Images API call.
 *
 * Returns both the full base URI and the Bearer token in one shot,
 * so callers can destructure and immediately make requests.
 */
export async function resolveCloudflareImagesCredentials(env: Env): Promise<{
  baseUri: string;
  apiToken: string;
}> {
  const [accountId, apiToken] = await Promise.all([
    getCloudflareAccountId(env),
    getCloudflareApiToken(env),
  ]);

  return {
    baseUri: `${CF_IMAGES_API}/${accountId}/images`,
    apiToken,
  };
}
