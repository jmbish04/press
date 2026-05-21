import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Distinct AI-extracted property names (e.g. author, topic, summary). */
export const propertyKeys = sqliteTable("property_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
});
