CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_account_user` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`actor_email` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_audit_time` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_unique` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `item_categories` (
	`item_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	PRIMARY KEY(`item_id`, `category_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `ix_item_categories_cat` ON `item_categories` (`category_id`,`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY NOT NULL,
	`lang` text NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`type` text NOT NULL,
	`multiple_meanings` integer DEFAULT false NOT NULL,
	`translation` text DEFAULT '{}' NOT NULL,
	`explanation` text DEFAULT '[]' NOT NULL,
	`synonyms` text DEFAULT '[]' NOT NULL,
	`hints` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_by` text,
	FOREIGN KEY (`lang`) REFERENCES `languages`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_items_type" CHECK(type IN ('word','expr')),
	CONSTRAINT "ck_items_status" CHECK(status IN ('draft','published')),
	CONSTRAINT "ck_items_multiple_meanings" CHECK(multiple_meanings IN (0,1)),
	CONSTRAINT "ck_items_translation_object" CHECK(json_valid(translation) AND json_type(translation) = 'object'),
	CONSTRAINT "ck_items_no_own_translation" CHECK(json_extract(translation, '$."' || lang || '"') IS NULL),
	CONSTRAINT "ck_items_explanation_array" CHECK(json_valid(explanation) AND json_type(explanation) = 'array'),
	CONSTRAINT "ck_items_synonyms_array" CHECK(json_valid(synonyms) AND json_type(synonyms) = 'array'),
	CONSTRAINT "ck_items_hints_array" CHECK(json_valid(hints) AND json_type(hints) = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ux_items_identity` ON `items` (`lang`,`normalized_text`,`type`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_items_playable` ON `items` (`lang`,`type`) WHERE status = 'published' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ix_items_trash` ON `items` (`deleted_at`) WHERE deleted_at IS NOT NULL;--> statement-breakpoint
CREATE TABLE `languages` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`native_name` text NOT NULL,
	`dir` text NOT NULL,
	`script` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ck_languages_dir" CHECK(dir IN ('ltr','rtl'))
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `ix_session_user` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`subject` text NOT NULL,
	`period` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `period`)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`banned` integer DEFAULT false NOT NULL,
	`ban_reason` text,
	`ban_expires` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `user_known_items` (
	`user_id` text NOT NULL,
	`item_id` integer NOT NULL,
	`known_target` text NOT NULL,
	`known_in_cycle` integer NOT NULL,
	`known_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_known_cycle" CHECK(known_in_cycle >= 1)
) WITHOUT ROWID;
--> statement-breakpoint
CREATE INDEX `ix_known_item` ON `user_known_items` (`item_id`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_verification_identifier` ON `verification` (`identifier`);