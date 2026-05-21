import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  rawContent: text("raw_content"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const propertyKeys = sqliteTable("property_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
});

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

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const articleTags = sqliteTable("article_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .references(() => articles.id)
    .notNull(),
  tagId: integer("tag_id")
    .references(() => tags.id)
    .notNull(),
});
