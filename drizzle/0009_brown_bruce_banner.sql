CREATE TABLE IF NOT EXISTS `visitor_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`device_type` text,
	`browser` text,
	`os` text,
	`country` text,
	`city` text,
	`region` text,
	`latitude` text,
	`longitude` text,
	`path` text,
	`referer` text,
	`visited_at` integer
);
