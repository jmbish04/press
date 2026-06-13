ALTER TABLE `articles` ADD `mindmap_data` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `color` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `is_active` integer DEFAULT true;