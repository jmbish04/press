import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Archived articles ingested via Browser Rendering. */
export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  rawContent: text("raw_content"),
  /** R2 object key (within the SPAWNED_PWAS bucket) of the page screenshot. */
  screenshotKey: text("screenshot_key"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
