CREATE TABLE `login_challenges` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `login_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mfa_recovery_codes` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`code_hash` varchar(64) NOT NULL,
	`used_at` datetime,
	CONSTRAINT `mfa_recovery_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mfa_totp` (
	`user_id` varchar(36) NOT NULL,
	`secret` varchar(255) NOT NULL,
	`confirmed_at` datetime,
	`last_time_step` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `mfa_totp_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `passkeys` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`credential_id` varchar(700) NOT NULL,
	`public_key` mediumblob NOT NULL,
	`counter` int NOT NULL DEFAULT 0,
	`transports` varchar(120),
	`backed_up` boolean NOT NULL DEFAULT false,
	`name` varchar(60) NOT NULL,
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`last_used_at` datetime,
	CONSTRAINT `passkeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `passkeys_credential_id_unique` UNIQUE(`credential_id`)
);
--> statement-breakpoint
CREATE TABLE `webauthn_challenges` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(36),
	`purpose` enum('register','login_mfa','login') NOT NULL,
	`challenge` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `webauthn_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `login_challenges` ADD CONSTRAINT `login_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mfa_recovery_codes` ADD CONSTRAINT `mfa_recovery_codes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mfa_totp` ADD CONSTRAINT `mfa_totp_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `passkeys` ADD CONSTRAINT `passkeys_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `webauthn_challenges` ADD CONSTRAINT `webauthn_challenges_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `login_challenges_user_id_idx` ON `login_challenges` (`user_id`);--> statement-breakpoint
CREATE INDEX `mfa_recovery_codes_user_id_idx` ON `mfa_recovery_codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `passkeys_user_id_idx` ON `passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `webauthn_challenges_user_id_idx` ON `webauthn_challenges` (`user_id`);