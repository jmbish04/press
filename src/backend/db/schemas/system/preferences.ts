/**
 * @fileoverview System-wide user preferences.
 *
 * Key-value store for application-level settings: narration voice,
 * AI Gateway routing preferences, notification toggles, etc.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const preferences = sqliteTable("preferences", {
  /** Preference key (e.g. "narration_voice", "ai_gateway_provider"). */
  key: text("key").primaryKey(),
  /** JSON-encoded value. */
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
