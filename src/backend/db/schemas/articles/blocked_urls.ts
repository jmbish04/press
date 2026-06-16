import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * URLs whose scrape returned a bot-block / access-denied page rather than a
 * real article (detected by Workers AI during ingestion). These are recorded
 * here instead of becoming articles, so they never appear on the Newsstand;
 * the Blocked page lists them by date.
 */
export const blockedUrls = sqliteTable("blocked_urls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  /** Short reason from the AI classifier (e.g. "Cloudflare challenge"). */
  reason: text("reason"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
