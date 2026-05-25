/**
 * @fileoverview Deploys a generated artifact to the SPAWNED_PWAS R2 bucket.
 *
 * Artifacts are served back through the worker's `/artifacts/*` route, so no
 * external R2 custom domain is required. PWA / summary-card artifacts are
 * single-file HTML; mind-map artifacts are JSON consumed by the in-app
 * mindmapcn `<MindMap>` component.
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

interface DeployOptions {
  /** Content-Type header to set on the R2 object. Defaults to text/html. */
  contentType?: string;
  /** File name within the artifact directory. Defaults to `index.html`. */
  fileName?: string;
}

/**
 * Writes the artifact content to R2 and returns its key + worker-served URL.
 * `content` may be a string (HTML/JSON) or any other R2-acceptable body.
 */
export async function deployPWAToR2(
  env: Env,
  content: string,
  title: string,
  type: ArtifactType,
  options: DeployOptions = {},
): Promise<DeployResult> {
  const contentType = options.contentType ?? "text/html; charset=utf-8";
  const fileName = options.fileName ?? "index.html";
  const id = crypto.randomUUID().slice(0, 8);
  const r2Key = `${type}/${slugify(title)}-${id}/${fileName}`;

  await env.SPAWNED_PWAS.put(r2Key, content, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
    },
  });

  return { r2Key, publicUrl: `/artifacts/${r2Key}` };
}
