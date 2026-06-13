/**
 * @fileoverview Publication sources — per-host identity and brand colors.
 *
 * Each source is keyed by hostname (e.g. `theverge.com`). During ingestion
 * the worker resolves the source from the article URL; if absent, it creates
 * one and auto-derives a color profile from the scraped page.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Publication source with brand identity for Newsstand cards. */
export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Hostname slug (e.g. "theverge.com"). Unique per publication. */
  key: text("key").notNull().unique(),
  /** Display name (e.g. "The Verge"). */
  name: text("name").notNull(),
  /** Brand accent color (hex or oklch). Used for card tinting + badges. */
  accent: text("accent"),
  /** Background color for synthetic card rendering. */
  bg: text("bg"),
  /** Short badge text for the Newsstand card overlay (e.g. "VRG"). */
  short: text("short"),
  /** Text colour on the accent masthead bar ("#fff" or "#000"). */
  ink: text("ink"),
  /** Typographic personality of the wordmark: serif|grotesque|condensed|mono|slab. */
  face: text("face").default("serif"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
