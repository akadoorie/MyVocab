-- "Category" becomes "Topic" everywhere (D-039). Renames in place: no table is rebuilt and no row
-- moves, so nothing cascades (D1 always enforces foreign keys). SQLite rewrites the foreign key in
-- item_topics to point at the renamed `topics` table; WITHOUT ROWID is kept (D-010).
ALTER TABLE `categories` RENAME TO `topics`;--> statement-breakpoint
ALTER TABLE `item_categories` RENAME TO `item_topics`;--> statement-breakpoint
ALTER TABLE `item_topics` RENAME COLUMN `category_id` TO `topic_id`;--> statement-breakpoint
-- Index names keep the old word after a table rename: recreate them under the new names.
DROP INDEX `categories_slug_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `topics_slug_unique` ON `topics` (`slug`);--> statement-breakpoint
DROP INDEX `ix_item_categories_cat`;--> statement-breakpoint
CREATE INDEX `ix_item_topics_topic` ON `item_topics` (`topic_id`,`item_id`);--> statement-breakpoint
-- The start card's default topic setting, if the admin ever saved one.
UPDATE `app_settings` SET `key` = 'defaults.topicId' WHERE `key` = 'defaults.categoryId';
