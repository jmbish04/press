import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const propertyKeys = sqliteTable("property_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
});
