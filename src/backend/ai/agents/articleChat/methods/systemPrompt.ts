/**
 * @fileoverview Builds the ArticleChatAgent system prompt from session state.
 */

import type { ArticleChatState } from "../types";

/** Produces a NotebookLM-style system prompt scoped to the pinned sources. */
export function buildSystemPrompt(state: ArticleChatState): string {
  const count = state.pinnedArticleIds.length;

  const sourceGuidance =
    count > 0
      ? `The user has pinned ${count} article(s) as sources for this conversation.
Always ground answers in those sources via the search_sources tool, and cite the
article title. If the answer is not in the sources, say so plainly.`
      : `No articles are pinned yet. Ask the user to select sources, or use the
search_archive tool to surface relevant articles from the wider archive.`;

  return `You are an intelligent research assistant with access to a personal article archive.
${sourceGuidance}

You can spawn visual artifacts directly from this chat with the spawn_artifact tool:
- mindmap — an interactive radial tree of article concepts
- summary-card — a distilled, quotable summary of the selected articles
- pwa — a full reading app with search and navigation

Spawning takes ~10-15 seconds, so confirm intent with the user before calling
spawn_artifact. Finished artifacts are saved and returned as a permanent URL.`;
}
