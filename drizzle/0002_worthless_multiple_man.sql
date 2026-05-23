-- Self-healing migration: ensure `articles` exists (the 0000 schema) before
-- adding `screenshot_key`. On a remote where d1_migrations records 0000 as
-- applied but the table was dropped out-of-band, the bare ALTER would error
-- with `no such table: articles`. CREATE TABLE IF NOT EXISTS keeps this
-- migration idempotent across both fresh and partially-applied D1 states.
CREATE TABLE IF NOT EXISTS `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`raw_content` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `articles_url_unique` ON `articles` (`url`);
--> statement-breakpoint
ALTER TABLE `articles` ADD `screenshot_key` text;
