/**
 * @fileoverview Saved views table.
 *
 * A saved view is a reusable filter preset — a named combination of include
 * tags, include keywords, include domains, and exclude criteria. Views appear
 * in the sidebar and filter the Newsstand when selected.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(),
  /** User-facing name shown in the sidebar (e.g. "Interview prep"). */
  name: text("name").notNull(),
  /** OKLCH hue for the sidebar dot colour. */
  hue: integer("hue").default(200),
  /**
   * JSON-encoded include facets:
   * `{ tags: { match: "any"|"all", items: string[] }, keywords: { match: "any"|"all", items: string[] }, domains: { match: "any"|"all", items: string[] } }`
   */
  includeFacets: text("include_facets").notNull(),
  /**
   * JSON-encoded exclude facets:
   * `{ tags: string[], keywords: string[] }`
   */
  excludeFacets: text("exclude_facets").notNull(),
  /** Soft delete flag. */
  deleted: integer("deleted", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
