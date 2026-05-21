import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** User-defined tags applied to articles. */
export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});
