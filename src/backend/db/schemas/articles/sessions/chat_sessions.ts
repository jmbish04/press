import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Tracks which articles are pinned to a chat session (NotebookLM-style "sources"). */
export const chatSessions = sqliteTable("chat_sessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  articleIds: text("article_ids").notNull(), // JSON array of article IDs
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
