/**
 * @fileoverview Generates an artifact, deploys it to R2, and records it in D1.
 */

import type { ChatToolContext, SpawnArtifactInput, SpawnArtifactResult } from "../types";

import { getDb } from "../../../../db";
import { spawnedArtifacts } from "../../../../db/schemas";
import { formatDigests, getArticleDigests } from "../../../rag/articleRag";
import { deployPWAToR2, generatePWACode } from "../../pwaSpawner";

/**
 * Resolves the target articles, generates the artifact HTML, deploys it, and
 * persists a `spawned_artifacts` row. Returns an error message string on
 * recoverable failures so the model can relay it to the user.
 */
export async function spawnArtifact(
  ctx: ChatToolContext,
  input: SpawnArtifactInput,
): Promise<SpawnArtifactResult | { error: string }> {
  const ids = input.articleIds?.length ? input.articleIds : ctx.getPinned();
  if (ids.length === 0) {
    return { error: "No articles selected. Pin sources before spawning an artifact." };
  }

  const digests = await getArticleDigests(ctx.env, ids);
  if (digests.length === 0) {
    return { error: "The selected articles have no archived content yet." };
  }

  const content = [formatDigests(digests), input.brief].filter(Boolean).join("\n\n");
  const html = await generatePWACode(ctx.env, content, input.title, input.type);
  const { r2Key, publicUrl } = await deployPWAToR2(ctx.env, html, input.title, input.type);

  const id = crypto.randomUUID();
  await getDb(ctx.env)
    .insert(spawnedArtifacts)
    .values({
      id,
      sessionId: ctx.sessionId,
      type: input.type,
      title: input.title,
      r2Key,
      publicUrl,
      articleIds: JSON.stringify(ids),
      createdAt: new Date(),
    });

  return { id, type: input.type, title: input.title, url: publicUrl };
}
