CREATE TABLE IF NOT EXISTS `ingestion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`source` text,
	`stage` integer DEFAULT 0,
	`state` text DEFAULT 'active',
	`title` text,
	`error` text,
	`article_id` integer,
	`workflow_instance_id` text,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `saved_views` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hue` integer DEFAULT 200,
	`include_facets` text NOT NULL,
	`exclude_facets` text NOT NULL,
	`deleted` integer DEFAULT false,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `preferences` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
ALTER TABLE `articles` ADD `audio_key` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `mindmap_key` text;--> statement-breakpoint
ALTER TABLE `spawned_artifacts` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `spawned_artifacts` ADD `context` text;--> statement-breakpoint
ALTER TABLE `spawned_artifacts` ADD `source_article_ids` text;--> statement-breakpoint
ALTER TABLE `spawned_artifacts` ADD `version` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `spawned_artifacts` ADD `parent_artifact_id` text;--> statement-breakpoint
ALTER TABLE `tags` ADD `archived` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `tags` ADD `hue` integer;