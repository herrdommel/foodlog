CREATE TABLE `admin_audit` (
	`id` varchar(36) NOT NULL,
	`actor_id` varchar(36),
	`action` varchar(48) NOT NULL,
	`target` varchar(255),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `admin_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `admin_audit` ADD CONSTRAINT `admin_audit_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit` (`created_at`);