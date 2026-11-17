-- v1 languages (PRD §1, §11.1). Data only, no vocabulary. More languages = more rows.
INSERT INTO `languages` (`code`, `name`, `native_name`, `dir`, `script`, `is_active`, `sort_order`) VALUES
  ('en', 'English', 'English', 'ltr', 'Latn', 1, 1),
  ('he', 'Hebrew', 'עברית', 'rtl', 'Hebr', 1, 2);
