/**
 * @fileoverview Semantic search over the full archived corpus.
 */

import { retrieveArticleContext } from "../../../rag/articleRag";

/** Returns grounding context for the closest articles to `query`. */
export async function searchArchive(env: Env, query: string): Promise<string> {
  const context = await retrieveArticleContext(env, query, [], 5);
  return context || "No matching articles were found in the archive.";
}
