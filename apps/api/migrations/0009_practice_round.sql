-- "Loop" becomes "practice" and "cycle" becomes "round" in the code too (D-081).
-- 1. The known-words table is rebuilt, because SQLite can't rename a constraint: the column
--    becomes known_in_round and its check ck_known_round. Every mark is copied as is (the same
--    shape as 0004: WITHOUT ROWID, D-010). Nothing references user_known_items, so dropping the
--    old table removes nothing else.
CREATE TABLE `__new_user_known_items` (
	`user_id` text NOT NULL,
	`item_id` integer NOT NULL,
	`known_target` text NOT NULL,
	`known_in_round` integer NOT NULL,
	`known_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`, `known_target`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_known_round" CHECK(known_in_round >= 1)
) WITHOUT ROWID;
--> statement-breakpoint
INSERT INTO `__new_user_known_items`("user_id", "item_id", "known_target", "known_in_round", "known_at") SELECT "user_id", "item_id", "known_target", "known_in_cycle", "known_at" FROM `user_known_items`;--> statement-breakpoint
DROP TABLE `user_known_items`;--> statement-breakpoint
ALTER TABLE `__new_user_known_items` RENAME TO `user_known_items`;--> statement-breakpoint
CREATE INDEX `ix_known_item` ON `user_known_items` (`item_id`);--> statement-breakpoint
-- 2. The settings saved by the admin, under their new keys.
UPDATE `app_settings` SET `key` = 'practice.sizeOptions' WHERE `key` = 'loop.sizeOptions';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'practice.defaultSize' WHERE `key` = 'loop.defaultSize';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'practice.maxSize' WHERE `key` = 'loop.maxSize';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'practice.continueSeconds' WHERE `key` = 'loop.continueSeconds';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'practice.nextSeconds' WHERE `key` = 'loop.nextSeconds';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'guests.practiceSize' WHERE `key` = 'guests.loopSize';--> statement-breakpoint
UPDATE `app_settings` SET `key` = 'guests.practicesPerHour' WHERE `key` = 'guests.loopsPerHour';
