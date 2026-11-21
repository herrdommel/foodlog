ALTER TABLE `admin_audit` ADD `target_user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `admin_audit` ADD `detail` varchar(255);--> statement-breakpoint
ALTER TABLE `admin_audit` ADD CONSTRAINT `admin_audit_target_user_id_users_id_fk` FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;