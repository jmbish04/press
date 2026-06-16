CREATE TABLE IF NOT EXISTS `blocked_urls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`reason` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `blocked_urls_url_unique` ON `blocked_urls` (`url`);