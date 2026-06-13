import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** User-defined tags applied to articles. */
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  /** Human-readable description of what this tag represents — fed to the AI agent during tagging. */
  description: text("description"),
  /** HTML hex color code (e.g. "#3b82f6") for consistent UI colour-coding. */
  color: text("color"),
  /** FK to parent tag for hierarchical folder-like structure. NULL = top-level tag. */
  parentId: integer("parent_id").references((): any => tags.id),
  /** Whether the tag has been soft-deleted / hidden from active use. */
  archived: integer("archived", { mode: "boolean" }).default(false),
  /** Whether the tag is actively used for new article assignments. False = retired. */
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  /** OKLCH hue value (0–360) for legacy colour-coding across the UI. */
  hue: integer("hue"),
});
