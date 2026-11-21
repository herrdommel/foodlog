CREATE TABLE `feature_flags` (
	`key` varchar(64) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`default_for_users` boolean NOT NULL DEFAULT false,
	CONSTRAINT `feature_flags_key` PRIMARY KEY(`key`)
);
