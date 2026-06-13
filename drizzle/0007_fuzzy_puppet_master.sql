CREATE TABLE IF NOT EXISTS `article_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`image_name` text NOT NULL,
	`image_cf_url` text NOT NULL,
	`position` integer,
	`caption` text,
	`created_at` integer,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
