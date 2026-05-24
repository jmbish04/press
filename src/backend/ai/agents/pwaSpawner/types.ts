/**
 * @fileoverview Type definitions for the PWA spawner.
 */

/** The kind of visual artifact to generate. */
export type ArtifactType = "pwa" | "mindmap" | "summary-card";

/** Location of a deployed artifact in R2. */
export interface DeployResult {
  /** Object key within the SPAWNED_PWAS bucket. */
  r2Key: string;
  /** Worker-served URL for opening the artifact. */
  publicUrl: string;
}

/** A single node in a mind-map tree, compatible with mind-elixir's NodeObj. */
export interface MindMapNode {
  id: string;
  topic: string;
  children?: MindMapNode[];
}

/** mind-elixir-compatible mind-map data envelope. */
export interface MindMapData {
  nodeData: MindMapNode;
}
