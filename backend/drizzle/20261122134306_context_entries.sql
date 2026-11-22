ALTER TABLE `entries` MODIFY COLUMN `type` enum('meal','drink','symptom','stool','medication','sleep','stress') NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `sleep_minutes` smallint;--> statement-breakpoint
ALTER TABLE `entries` ADD `rating` tinyint;