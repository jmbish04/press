import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Tracks every PWA / mind-map / summary card the agent has spawned. */
export const spawnedArtifacts = sqliteTable("spawned_artifacts", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type", { enum: ["pwa", "mindmap", "summary-card"] }).notNull(),
  title: text("title").notNull(),
  r2Key: text("r2_key").notNull(),
  publicUrl: text("public_url"),
  articleIds: text("article_ids").notNull(), // JSON array — which articles were used
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
