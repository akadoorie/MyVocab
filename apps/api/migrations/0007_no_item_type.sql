-- "Words" vs "Expressions" goes away (D-046): an item can be anything, and its topics classify it.
-- Expressions that aren't idioms join a new topic, "Expressions (except Idioms)", which can't be
-- combined with "Idioms" on one item. Then the items table is rebuilt without `type`.
--
-- The rebuild is hand-written for D1, which always enforces foreign keys: dropping `items` would
-- cascade-delete its topic links and known words. So both are copied aside first, the rebuilt
-- table takes the old name, and they are copied back. No row of either is lost; ids are kept.

-- 1. Topics that can't be combined (kept symmetric by the topic service).
ALTER TABLE `topics` ADD `excludes_topic_id` integer;--> statement-breakpoint
INSERT INTO `topics` (`slug`, `name`, `is_active`, `sort_order`, `created_at`, `updated_at`)
  SELECT 'expressions', 'Expressions (except Idioms)', 1,
         COALESCE((SELECT MAX(`sort_order`) FROM `topics`), 0) + 1,
         CAST(unixepoch('subsec') * 1000 AS INTEGER), CAST(unixepoch('subsec') * 1000 AS INTEGER)
  WHERE NOT EXISTS (SELECT 1 FROM `topics` WHERE `slug` = 'expressions');--> statement-breakpoint
UPDATE `topics` SET `excludes_topic_id` = (SELECT `id` FROM `topics` WHERE `slug` = 'idioms')
  WHERE `slug` = 'expressions';--> statement-breakpoint
UPDATE `topics` SET `excludes_topic_id` = (SELECT `id` FROM `topics` WHERE `slug` = 'expressions')
  WHERE `slug` = 'idioms';--> statement-breakpoint

-- 2. While `type` still exists: expressions not in "Idioms" join "Expressions (except Idioms)".
INSERT OR IGNORE INTO `item_topics` (`item_id`, `topic_id`)
  SELECT i.`id`, (SELECT `id` FROM `topics` WHERE `slug` = 'expressions')
  FROM `items` i
  WHERE i.`type` = 'expr'
    AND NOT EXISTS (SELECT 1 FROM `item_topics` it JOIN `topics` t ON t.`id` = it.`topic_id`
                    WHERE it.`item_id` = i.`id` AND t.`slug` = 'idioms');--> statement-breakpoint

-- 3. Copy the rows that refer to items aside, and empty them (so the drop cascades nothing).
CREATE TABLE `__keep_item_topics` AS SELECT * FROM `item_topics`;--> statement-breakpoint
CREATE TABLE `__keep_user_known_items` AS SELECT * FROM `user_known_items`;--> statement-breakpoint
DELETE FROM `item_topics`;--> statement-breakpoint
DELETE FROM `user_known_items`;--> statement-breakpoint

-- 4. Rebuild items without `type` (identity is now language + text).
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`lang` text NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`multiple_meanings` integer DEFAULT false NOT NULL,
	`translation_parallel` text DEFAULT '{}' NOT NULL,
	`translation_meaning` text DEFAULT '{}' NOT NULL,
	`translation_literal` text DEFAULT '{}' NOT NULL,
	`explanation` text DEFAULT '[]' NOT NULL,
	`synonyms` text DEFAULT '[]' NOT NULL,
	`hints` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`in_sample_set` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`lang`) REFERENCES `languages`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_items_status" CHECK(status IN ('draft','published')),
	CONSTRAINT "ck_items_multiple_meanings" CHECK(multiple_meanings IN (0,1)),
	CONSTRAINT "ck_items_translation_object" CHECK(json_valid(translation_parallel) AND json_type(translation_parallel) = 'object'),
	CONSTRAINT "ck_items_no_own_translation" CHECK(json_extract(translation_parallel, '$."' || lang || '"') IS NULL),
	CONSTRAINT "ck_items_meaning_object" CHECK(json_valid(translation_meaning) AND json_type(translation_meaning) = 'object'),
	CONSTRAINT "ck_items_no_own_meaning" CHECK(json_extract(translation_meaning, '$."' || lang || '"') IS NULL),
	CONSTRAINT "ck_items_literal_object" CHECK(json_valid(translation_literal) AND json_type(translation_literal) = 'object'),
	CONSTRAINT "ck_items_no_own_literal" CHECK(json_extract(translation_literal, '$."' || lang || '"') IS NULL),
	CONSTRAINT "ck_items_explanation_array" CHECK(json_valid(explanation) AND json_type(explanation) = 'array'),
	CONSTRAINT "ck_items_synonyms_array" CHECK(json_valid(synonyms) AND json_type(synonyms) = 'array'),
	CONSTRAINT "ck_items_hints_array" CHECK(json_valid(hints) AND json_type(hints) = 'array')
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "lang", "text", "normalized_text", "multiple_meanings", "translation_parallel", "translation_meaning", "translation_literal", "explanation", "synonyms", "hints", "status", "in_sample_set", "version", "created_by", "created_at", "updated_at", "deleted_at", "deleted_by") SELECT "id", "lang", "text", "normalized_text", "multiple_meanings", "translation_parallel", "translation_meaning", "translation_literal", "explanation", "synonyms", "hints", "status", "in_sample_set", "version", "created_by", "created_at", "updated_at", "deleted_at", "deleted_by" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
CREATE UNIQUE INDEX `ux_items_identity` ON `items` (`lang`,`normalized_text`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_items_playable` ON `items` (`lang`) WHERE status = 'published' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_items_trash` ON `items` (`deleted_at`) WHERE deleted_at IS NOT NULL;--> statement-breakpoint

-- 5. Put the links and known words back, then drop the copies.
INSERT INTO `item_topics` SELECT * FROM `__keep_item_topics`;--> statement-breakpoint
INSERT INTO `user_known_items` SELECT * FROM `__keep_user_known_items`;--> statement-breakpoint
DROP TABLE `__keep_item_topics`;--> statement-breakpoint
DROP TABLE `__keep_user_known_items`;--> statement-breakpoint

-- 6. The start card's default type setting is gone.
DELETE FROM `app_settings` WHERE `key` = 'defaults.type';
