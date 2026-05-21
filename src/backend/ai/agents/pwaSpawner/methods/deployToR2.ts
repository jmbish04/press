/**
 * @fileoverview Deploys a generated artifact to the SPAWNED_PWAS R2 bucket.
 *
 * Artifacts are served back through the worker's `/artifacts/*` route, so no
 * external R2 custom domain is required.
 */

import type { ArtifactType, DeployResult } from "../types";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "artifact"
  );
}

/** Writes the HTML to R2 and returns its key and worker-served URL. */
export async function deployPWAToR2(
  env: Env,
  html: string,
  title: string,
  type: ArtifactType,
): Promise<DeployResult> {
  const id = crypto.randomUUID().slice(0, 8);
  const r2Key = `${type}/${slugify(title)}-${id}/index.html`;

  await env.SPAWNED_PWAS.put(r2Key, html, {
    httpMetadata: {
      contentType: "text/html; charset=utf-8",
      cacheControl: "public, max-age=31536000",
    },
  });

  return { r2Key, publicUrl: `/artifacts/${r2Key}` };
}
