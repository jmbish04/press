import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

import { articles } from "./articles";
import { tags } from "./tags";

/** Many-to-many mapping between articles and tags. */
export const articleTags = sqliteTable("article_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .references(() => articles.id)
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id)
    .notNull(),
});
