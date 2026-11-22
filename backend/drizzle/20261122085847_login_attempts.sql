CREATE TABLE `login_attempts` (
	`email_hash` varchar(64) NOT NULL,
	`failures` int NOT NULL,
	`window_started_at` datetime NOT NULL,
	CONSTRAINT `login_attempts_email_hash` PRIMARY KEY(`email_hash`)
);
