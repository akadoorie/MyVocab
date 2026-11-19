-- Three kinds of translation per other language (PRD §8.1, D-024): the parallel (the old
-- `translation`), the meaning (new) and the literal translation (the old `literal`).
-- Hand-written, like 0002: drizzle-kit would rebuild `items`, and on D1 (foreign keys always on)
-- dropping the old table would cascade-delete known marks and category links. RENAME COLUMN and
-- ADD COLUMN keep every row; SQLite rewrites the existing CHECK constraints to the new column
-- names (the constraint names stay as they were).
ALTER TABLE `items` RENAME COLUMN `translation` TO `translation_parallel`;
--> statement-breakpoint
ALTER TABLE `items` RENAME COLUMN `literal` TO `translation_literal`;
--> statement-breakpoint
ALTER TABLE `items` ADD COLUMN `translation_meaning` text DEFAULT '{}' NOT NULL
	CONSTRAINT "ck_items_meaning_object" CHECK(json_valid(translation_meaning) AND json_type(translation_meaning) = 'object')
	CONSTRAINT "ck_items_no_own_meaning" CHECK(json_extract(translation_meaning, '$."' || lang || '"') IS NULL);
