/**
 * @fileoverview Type definitions for the ArticleChatAgent.
 */

import type { ArtifactType } from "../pwaSpawner";

export type { ArtifactType };

/** Durable Object state persisted per chat session. */
export interface ArticleChatState {
  /** Article IDs pinned as sources for this conversation. */
  pinnedArticleIds: number[];
  /** Human-readable session name. */
  sessionName: string;
}

/** Default state for a freshly created session. */
export const INITIAL_CHAT_STATE: ArticleChatState = {
  pinnedArticleIds: [],
  sessionName: "Untitled notebook",
};

/** Input accepted by the spawn_artifact tool. */
export interface SpawnArtifactInput {
  type: ArtifactType;
  title: string;
  /** Overrides the pinned sources when provided. */
  articleIds?: number[];
  /** Optional extra instructions for the generator. */
  brief?: string;
}

/** Result returned by a successful spawn. */
export interface SpawnArtifactResult {
  id: string;
  type: ArtifactType;
  title: string;
  url: string;
}

/**
 * Decouples the tools from the Durable Object: the agent supplies the env,
 * session ID, and accessors for its persisted source list.
 */
export interface ChatToolContext {
  env: Env;
  sessionId: string;
  getPinned: () => number[];
  setSources: (ids: number[], name?: string) => void;
}
