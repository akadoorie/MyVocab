-- Literal (word-for-word) meaning per other language (PRD §8.1, D-016).
-- Hand-written: drizzle-kit would rebuild `items`, and on D1 (foreign keys always on) dropping the
-- old table would cascade-delete known marks and category links. ADD COLUMN keeps every row.
ALTER TABLE `items` ADD COLUMN `literal` text DEFAULT '{}' NOT NULL
	CONSTRAINT "ck_items_literal_object" CHECK(json_valid(literal) AND json_type(literal) = 'object')
	CONSTRAINT "ck_items_no_own_literal" CHECK(json_extract(literal, '$."' || lang || '"') IS NULL);
