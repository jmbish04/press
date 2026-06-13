/**
 * @fileoverview Generates an artifact, deploys it to R2, and records it in D1.
 *
 * - `pwa` / `summary-card` artifacts are single-file HTML documents.
 * - `mindmap` artifacts are mind-elixir JSON trees rendered in-app by the
 *   mindmapcn `<MindMap>` component (no standalone HTML).
 *
 * Each artifact stores full provenance: the prompt used, context provided,
 * source article IDs, and version chain info for iteration.
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

  // Determine version info (for iteration chains).
  let version = 1;
  let parentArtifactId: string | null = null;
  if (input.iterateArtifactId) {
    const db = getDb(ctx.env);
    const [parent] = await db
      .select({ version: spawnedArtifacts.version })
      .from(spawnedArtifacts)
      .where(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (await import("drizzle-orm")).eq(spawnedArtifacts.id, input.iterateArtifactId),
      )
      .limit(1);
    version = (parent?.version ?? 1) + 1;
    parentArtifactId = input.iterateArtifactId;
  }

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
      prompt: input.brief ?? null,
      context: content.slice(0, 2000),
      sourceArticleIds: JSON.stringify(ids),
      version,
      parentArtifactId,
      createdAt: new Date(),
    });

  return { id, type: input.type, title: input.title, url: publicUrl };
}

