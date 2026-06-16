ALTER TABLE `articles` ADD `is_read` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `articles` ADD `read_at` integer;