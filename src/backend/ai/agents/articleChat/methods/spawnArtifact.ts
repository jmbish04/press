/**
 * @fileoverview Generates an artifact, deploys it to R2, and records it in D1.
 *
 * - `pwa` / `summary-card` artifacts are single-file HTML documents.
 * - `mindmap` artifacts are mind-elixir JSON trees rendered in-app by the
 *   mindmapcn `<MindMap>` component (no standalone HTML).
 */

import type { ChatToolContext, SpawnArtifactInput, SpawnArtifactResult } from "../types";

import { getDb } from "../../../../db";
import { spawnedArtifacts } from "../../../../db/schemas";
import { formatDigests, getArticleDigests } from "../../../rag/articleRag";
import { deployPWAToR2, generateMindMapData, generatePWACode } from "../../pwaSpawner";

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

  let r2Key: string;
  let publicUrl: string;

  if (input.type === "mindmap") {
    const data = await generateMindMapData(ctx.env, content, input.title);
    const deployed = await deployPWAToR2(ctx.env, JSON.stringify(data), input.title, "mindmap", {
      contentType: "application/json; charset=utf-8",
      fileName: "data.json",
    });
    r2Key = deployed.r2Key;
    publicUrl = deployed.publicUrl;
  } else {
    const html = await generatePWACode(ctx.env, content, input.title, input.type);
    const deployed = await deployPWAToR2(ctx.env, html, input.title, input.type);
    r2Key = deployed.r2Key;
    publicUrl = deployed.publicUrl;
  }

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
