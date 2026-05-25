import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { articles } from "./articles";
import { propertyKeys } from "./property_keys";

/** AI-extracted key/value metadata mapped to an article. */
export const articleProperties = sqliteTable("article_properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .references(() => articles.id)
    .notNull(),
  propertyId: integer("property_id")
    .references(() => propertyKeys.id)
    .notNull(),
  value: text("value").notNull(),
});
