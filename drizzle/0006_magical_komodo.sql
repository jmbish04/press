CREATE TABLE IF NOT EXISTS `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`accent` text,
	`bg` text,
	`short` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sources_key_unique` ON `sources` (`key`);--> statement-breakpoint
ALTER TABLE `articles` ADD `clean_content` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `rag_uuid` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `source_id` integer REFERENCES sources(id);