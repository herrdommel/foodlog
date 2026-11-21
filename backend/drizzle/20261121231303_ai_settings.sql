CREATE TABLE `ai_keys` (
	`user_id` varchar(36) NOT NULL,
	`provider` enum('anthropic','openai') NOT NULL,
	`ciphertext` text NOT NULL,
	`last4` varchar(4) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ai_keys_user_id_provider_pk` PRIMARY KEY(`user_id`,`provider`)
);
--> statement-breakpoint
CREATE TABLE `ai_settings` (
	`user_id` varchar(36) NOT NULL,
	`provider` enum('anthropic','openai'),
	`model` varchar(100),
	`consent_version` int,
	`consent_at` datetime,
	CONSTRAINT `ai_settings_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
ALTER TABLE `ai_keys` ADD CONSTRAINT `ai_keys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ai_settings` ADD CONSTRAINT `ai_settings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;