import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { articles } from "./articles";

/** Images extracted from articles and hosted on Cloudflare Images. */
export const articleImages = sqliteTable("article_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id")
    .notNull()
    .references(() => articles.id),
  /** Descriptive name derived from alt text or caption. */
  imageName: text("image_name").notNull(),
  /** Cloudflare Images delivery URL. */
  imageCfUrl: text("image_cf_url").notNull(),
  /** 0-based paragraph index for inline placement in the Reader. */
  position: integer("position"),
  /** Image caption if present. */
  caption: text("caption"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
