-- A topic's name in the Hebrew UI (D-080). Only adds a nullable column: no table is rebuilt and no
-- row moves (known words are untouched). Empty = the Hebrew UI shows the English `name`.
ALTER TABLE `topics` ADD `name_he` text;
