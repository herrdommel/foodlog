CREATE TABLE `ingredient_names` (
	`ingredient_id` varchar(36) NOT NULL,
	`locale` varchar(8) NOT NULL,
	`name` varchar(80) NOT NULL,
	CONSTRAINT `ingredient_names_ingredient_id_locale_pk` PRIMARY KEY(`ingredient_id`,`locale`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `locale` varchar(8) NOT NULL DEFAULT 'de';--> statement-breakpoint
ALTER TABLE `ingredient_names` ADD CONSTRAINT `ingredient_names_ingredient_id_ingredients_id_fk` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ingredient_names_name_idx` ON `ingredient_names` (`name`);--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `name_de`;--> statement-breakpoint
ALTER TABLE `ingredients` DROP COLUMN `name_en`;