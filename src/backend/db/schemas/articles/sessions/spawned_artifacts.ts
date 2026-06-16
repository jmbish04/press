import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Tracks every PWA / mind-map / summary card the agent has spawned.
 *
 * Each artifact stores full provenance (prompt, context, source articles)
 * and supports versioning for iterative PWA builds.
 */
export const spawnedArtifacts = sqliteTable("spawned_artifacts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type", { enum: ["pwa", "mindmap", "summary-card"] }).notNull(),
  title: text("title").notNull(),
  r2Key: text("r2_key").notNull(),
  publicUrl: text("public_url"),
  articleIds: text("article_ids").notNull(), // JSON array — which articles were used
  /** The user's generation prompt that triggered the build. */
  prompt: text("prompt"),
  /** Truncated article content / context passed to the AI for generation. */
  context: text("context"),
  /** JSON array of article IDs explicitly pinned as sources. */
  sourceArticleIds: text("source_article_ids"),
  /** Version number (1-based). Increments when a PWA is iterated upon. */
  version: integer("version").default(1),
  /** Links to the previous version of this artifact for version-chain traversal. */
  parentArtifactId: text("parent_artifact_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
