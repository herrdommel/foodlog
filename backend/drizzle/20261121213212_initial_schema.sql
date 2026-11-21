CREATE TABLE `auth_tokens` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`type` enum('verify_email','reset_password','change_email') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`new_email` varchar(254),
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `entries` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`type` enum('meal','drink','symptom','stool','medication') NOT NULL,
	`occurred_at` datetime NOT NULL,
	`title` varchar(120),
	`note` text,
	`symptom_type` varchar(32),
	`severity` tinyint,
	`bristol` tinyint,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entry_ingredients` (
	`entry_id` varchar(36) NOT NULL,
	`ingredient_id` varchar(36) NOT NULL,
	CONSTRAINT `entry_ingredients_entry_id_ingredient_id_pk` PRIMARY KEY(`entry_id`,`ingredient_id`)
);
--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`default_for_users` boolean NOT NULL DEFAULT false,
	CONSTRAINT `feature_flags_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `ingredient_allergens` (
	`ingredient_id` varchar(36) NOT NULL,
	`allergen` varchar(32) NOT NULL,
	CONSTRAINT `ingredient_allergens_ingredient_id_allergen_pk` PRIMARY KEY(`ingredient_id`,`allergen`)
);
--> statement-breakpoint
CREATE TABLE `ingredients` (
	`id` varchar(36) NOT NULL,
	`catalog_key` varchar(64),
	`user_id` varchar(36),
	`name_de` varchar(80) NOT NULL,
	`name_en` varchar(80) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `ingredients_catalog_key_unique` UNIQUE(`catalog_key`)
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`id` varchar(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`email` varchar(254),
	`created_by` varchar(36),
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`used_by` varchar(36),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `invites_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`provider` varchar(32) NOT NULL,
	`provider_user_id` varchar(128) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `oauth_accounts_provider_provider_user_id_pk` PRIMARY KEY(`provider`,`provider_user_id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`expires_at` datetime NOT NULL,
	`last_used_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` varchar(255) NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `template_ingredients` (
	`template_id` varchar(36) NOT NULL,
	`ingredient_id` varchar(36) NOT NULL,
	CONSTRAINT `template_ingredients_template_id_ingredient_id_pk` PRIMARY KEY(`template_id`,`ingredient_id`)
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(80) NOT NULL,
	`type` enum('meal','drink','medication') NOT NULL,
	`title` varchar(120),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `templates_user_name_idx` UNIQUE(`user_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `user_avatars` (
	`user_id` varchar(36) NOT NULL,
	`data` mediumblob NOT NULL,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `user_avatars_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_feature_overrides` (
	`user_id` varchar(36) NOT NULL,
	`key` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL,
	CONSTRAINT `user_feature_overrides_user_id_key_pk` PRIMARY KEY(`user_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`email_verified_at` datetime,
	`password_hash` varchar(255),
	`name` varchar(100) NOT NULL,
	`avatar` varchar(16) NOT NULL DEFAULT 'preset:1',
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`active` boolean NOT NULL DEFAULT true,
	`locale` enum('de','en') NOT NULL DEFAULT 'de',
	`timezone` varchar(64) NOT NULL DEFAULT 'Europe/Berlin',
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entries` ADD CONSTRAINT `entries_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entry_ingredients` ADD CONSTRAINT `entry_ingredients_entry_id_entries_id_fk` FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `entry_ingredients` ADD CONSTRAINT `entry_ingredients_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredient_allergens` ADD CONSTRAINT `ingredient_allergens_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ingredients` ADD CONSTRAINT `ingredients_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invites` ADD CONSTRAINT `invites_used_by_users_id_fk` FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oauth_accounts` ADD CONSTRAINT `oauth_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_ingredients` ADD CONSTRAINT `template_ingredients_template_id_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `template_ingredients` ADD CONSTRAINT `template_ingredients_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `templates` ADD CONSTRAINT `templates_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_avatars` ADD CONSTRAINT `user_avatars_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_feature_overrides` ADD CONSTRAINT `user_feature_overrides_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `auth_tokens_user_type_idx` ON `auth_tokens` (`user_id`,`type`);--> statement-breakpoint
CREATE INDEX `entries_user_occurred_idx` ON `entries` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `entry_ingredients_ingredient_idx` ON `entry_ingredients` (`ingredient_id`);--> statement-breakpoint
CREATE INDEX `ingredients_user_id_idx` ON `ingredients` (`user_id`);--> statement-breakpoint
CREATE INDEX `oauth_accounts_user_id_idx` ON `oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);