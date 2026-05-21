import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

import { articles } from "../core/articles";
import { propertyKeys } from "./property_keys";

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
