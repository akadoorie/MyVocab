# Data model: tables and relationships

An overview of the database (Cloudflare D1, SQLite). The full column-level schema is in
[PRD §11](../PRD.md#11-data-model) and in [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts).

There are **12 tables** in four groups. "1 → N" means one row on the left relates to many rows on
the right; "N ↔ M" is many-to-many, through a join table.

```
                ┌──────────── session        (1 → N)
                ├──────────── account        (1 → N)
   user ────────┼──────────── user_known_items ─────────┐   (N ↔ M: user ↔ items)
     │          ├┄┄ items.created_by / deleted_by (1 → N)│
     │          └┄┄ app_settings.updated_by    (1 → N)  │
     │                                                  │
 languages ───────────── items ─────────────────────────┘
   (1 → N)                │
                    item_categories ───── categories        (N ↔ M: items ↔ categories)

 Standalone (no links): verification · usage_counters · audit_log
```

## Sign-in (managed by Better Auth)

| Table          | What it holds                           | Relationship                                                    |
| -------------- | --------------------------------------- | --------------------------------------------------------------- |
| `user`         | One row per learner or admin            | The center of the user side                                     |
| `session`      | One row per signed-in browser or device | user **1 → N** session. Deleted with the user                   |
| `account`      | The link to the Google login            | user **1 → N** account (in practice one). Deleted with the user |
| `verification` | Short-lived tokens used during sign-in  | Standalone, no link                                             |

## Vocabulary

| Table             | What it holds                                  | Relationship                                                                                                 |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `languages`       | Languages: name, text direction, active or not | languages **1 → N** items (each item has one language)                                                       |
| `items`           | One row per word or expression                 | Belongs to one language; linked to many categories and many users (below)                                    |
| `categories`      | Topics                                         | categories **N ↔ M** items, through `item_categories`                                                        |
| `item_categories` | Pairs of (item, category)                      | The join table for that N ↔ M. Deleting an item removes its pairs; deleting a category is blocked while used |

## Learning

| Table              | What it holds                                         | Relationship                                                               |
| ------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| `user_known_items` | Pairs of (user, item) for every Know (forever) answer | The join table for user **N ↔ M** items. Deleted with the user or the item |

"Know · ask again" (PRD FR-L27a) writes nothing here.

## Operations

| Table            | What it holds                                | Relationship                                                                                  |
| ---------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `app_settings`   | Admin settings (defaults, limits, …)         | user **1 → N** settings through "last changed by"; emptied if that user is deleted            |
| `usage_counters` | Anti-scraping counters per day               | Standalone: the key is a user id or a hashed guest IP, so it has no database link             |
| `audit_log`      | Admin actions (add, edit, delete, import, …) | Standalone on purpose: the actor is kept as plain text, so the history outlives deleted users |

## Details

- `items` has two more **1 → N** links to `user`: **created by** and **deleted by**. If that
  account is deleted, the field is emptied and the item stays.
- An item's **translations, literal meanings, explanations, hints and synonyms** are not separate
  tables. They are JSON inside the item's own row, because they always load together with the
  item; CHECK constraints keep them well-formed.
- Cloudflare D1 also keeps its own `d1_migrations` table (which schema migrations were applied).
  It is not app data.

## How a Know is remembered

`user_known_items` keeps **one row per (user, item) pair**: the item's numeric id, never the word's
text or a hash of it. Its primary key is `(user_id, item_id)` and the table is `WITHOUT ROWID`, so
it is stored sorted by user: one user's known items sit together and are read with one range scan.
An index on `item_id` serves the other direction (removing the rows of a deleted item).

- **Starting a session** checks "does (this user, this item) exist?" for each candidate item: a
  single primary-key lookup, fast at any table size.
- **An id, not text or a hash:** smaller; survives an admin fixing a typo in the word; and keeps
  no copies of the vocabulary in user data.
- **Not a list per word or per user** (an array in one row): every Know would rewrite a growing
  row, concurrent Knows could overwrite each other, and the list could not be indexed.
- **Size:** about 60 bytes per row, so 1,000 users who each know 500 items take about 30 MB.
- `known_target`, `known_in_cycle` and `known_at` are for display on My known words (the
  direction, "Already knew" vs "Learned here", and the date).
