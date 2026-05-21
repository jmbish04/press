import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  definition: text("definition"),
  hexColor: text("hex_color")
    .notNull()
    .$defaultFn(() => "#3b82f6"),
});
