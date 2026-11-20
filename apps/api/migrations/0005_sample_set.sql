-- The sample set (D-038): guests play only items in it. A plain column add (no table rebuild:
-- D1 always enforces foreign keys, so rebuilding `items` would cascade to its links).
-- New items start outside the set (default 0); every item that exists today joins it, so guests
-- see the same items as before until the admin narrows the set.
ALTER TABLE `items` ADD `in_sample_set` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `items` SET `in_sample_set` = 1;
