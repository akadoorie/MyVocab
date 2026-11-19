import type { LangCode, LanguageMap } from '../lang/languages';
import { isValidLangCode } from '../lang/languages';
import { cleanText, normalize } from '../text/normalize';
import { foreignLetters } from '../text/script';
import { ITEM_LIMITS, type ListName } from './limits';
import {
  ITEM_TYPES,
  OWN_LANGUAGE_LISTS,
  TRANSLATION_KINDS,
  type ItemContent,
  type ItemType,
  type Translations,
} from './types';

/**
 * The single set of item rules (PRD §8.1, §10.4 "One validation module for items"), shared by the
 * admin editor, the API and the CSV importer.
 */

export type ItemIssueCode =
  | 'REQUIRED'
  | 'TOO_LONG'
  | 'TOO_MANY'
  | 'DUPLICATE'
  | 'INVALID_CHARACTER'
  | 'INVALID_TYPE'
  | 'UNKNOWN_LANGUAGE'
  | 'SAME_LANGUAGE_TRANSLATION'
  | 'MULTIPLE_MEANINGS_SINGLE_ENTRY'
  | 'MIXED_SCRIPT';

/** Separates list entries in a CSV cell, so it can't appear inside an entry (PRD §8.3). */
export const LIST_SEPARATOR = '|';

export type ItemIssue = { path: string; code: ItemIssueCode; message: string };

/** Raw, untrusted input: lists may be missing, entries may need cleaning. */
export type ItemInput = {
  lang: string;
  text: string;
  type: string;
  multipleMeanings?: boolean;
  parallel?: Record<string, readonly string[]>;
  meaning?: Record<string, readonly string[]>;
  literal?: Record<string, readonly string[]>;
  explanation?: readonly string[];
  synonyms?: readonly string[];
  hints?: readonly string[];
};

export type ItemValidationResult = {
  /** Cleaned content. Only meaningful when `errors` is empty. */
  value: ItemContent;
  errors: ItemIssue[];
  /** Non-blocking issues shown as badges in the editor and in the CSV dry run. */
  warnings: ItemIssue[];
};

export type ItemValidationContext = {
  /** Languages that may be used (active languages). */
  languages: LanguageMap;
};

function cleanList(
  entries: readonly string[] | undefined,
  list: ListName,
  path: string,
  errors: ItemIssue[],
): string[] {
  const limits = ITEM_LIMITS[list];
  const cleaned = (entries ?? []).map(cleanText).filter((e) => e.length > 0);
  const seen = new Set<string>();
  cleaned.forEach((entry, i) => {
    if (entry.length > limits.entryMax) {
      errors.push({
        path: `${path}[${i}]`,
        code: 'TOO_LONG',
        message: `Must be at most ${limits.entryMax} characters`,
      });
    }
    if (entry.includes(LIST_SEPARATOR)) {
      errors.push({
        path: `${path}[${i}]`,
        code: 'INVALID_CHARACTER',
        message: `Entries cannot contain "${LIST_SEPARATOR}"`,
      });
    }
    const key = normalize(entry);
    if (seen.has(key)) {
      errors.push({
        path: `${path}[${i}]`,
        code: 'DUPLICATE',
        message: `Duplicate entry "${entry}"`,
      });
    }
    seen.add(key);
  });
  if (cleaned.length > limits.maxEntries) {
    errors.push({ path, code: 'TOO_MANY', message: `At most ${limits.maxEntries} entries` });
  }
  return cleaned;
}

const SAME_LANGUAGE_MESSAGE: Record<(typeof TRANSLATION_KINDS)[number], string> = {
  parallel: 'An item cannot have a translation into its own language; use the explanation',
  meaning: 'An item cannot have a meaning in its own language; use the explanation',
  literal: 'An item cannot have a literal translation in its own language',
};

/** A per-language list object (parallel, meaning, literal): other active languages only. */
function cleanPerLanguage(
  input: Record<string, readonly string[]> | undefined,
  list: (typeof TRANSLATION_KINDS)[number],
  lang: string,
  ctx: ItemValidationContext,
  errors: ItemIssue[],
): Translations {
  const out: Translations = {};
  for (const [rawCode, entries] of Object.entries(input ?? {})) {
    const code = rawCode.trim().toLowerCase();
    const path = `${list}.${code}`;
    if (code === lang) {
      errors.push({
        path,
        code: 'SAME_LANGUAGE_TRANSLATION',
        message: SAME_LANGUAGE_MESSAGE[list],
      });
      continue;
    }
    if (!isValidLangCode(code) || !ctx.languages[code]) {
      errors.push({ path, code: 'UNKNOWN_LANGUAGE', message: `Unknown language "${code}"` });
      continue;
    }
    const cleaned = cleanList(entries, list, path, errors);
    if (cleaned.length > 0) out[code] = cleaned;
  }
  return out;
}

function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(value);
}

export function validateItem(input: ItemInput, ctx: ItemValidationContext): ItemValidationResult {
  const errors: ItemIssue[] = [];
  const warnings: ItemIssue[] = [];

  const lang = input.lang.trim().toLowerCase();
  if (!ctx.languages[lang]) {
    errors.push({ path: 'lang', code: 'UNKNOWN_LANGUAGE', message: `Unknown language "${lang}"` });
  }

  const text = cleanText(input.text);
  if (text.length === 0 || normalize(text).length === 0) {
    errors.push({ path: 'text', code: 'REQUIRED', message: 'Text is required' });
  } else if (text.length > ITEM_LIMITS.textMax) {
    errors.push({
      path: 'text',
      code: 'TOO_LONG',
      message: `Must be at most ${ITEM_LIMITS.textMax} characters`,
    });
  }

  const type = input.type.trim().toLowerCase();
  if (!isItemType(type)) {
    errors.push({ path: 'type', code: 'INVALID_TYPE', message: 'Type must be "word" or "expr"' });
  }

  const parallel = cleanPerLanguage(input.parallel, 'parallel', lang, ctx, errors);
  const meaning = cleanPerLanguage(input.meaning, 'meaning', lang, ctx, errors);
  const literal = cleanPerLanguage(input.literal, 'literal', lang, ctx, errors);

  const explanation = cleanList(input.explanation, 'explanation', 'explanation', errors);
  const synonyms = cleanList(input.synonyms, 'synonyms', 'synonyms', errors);
  const hints = cleanList(input.hints, 'hints', 'hints', errors);

  const value: ItemContent = {
    lang,
    text,
    type: isItemType(type) ? type : 'word',
    multipleMeanings: input.multipleMeanings ?? false,
    parallel,
    meaning,
    literal,
    explanation,
    synonyms,
    hints,
  };

  warnings.push(...multipleMeaningsWarnings(value), ...mixedScriptWarnings(value, ctx.languages));
  return { value, errors, warnings };
}

/**
 * "Multiple meanings" is on, but the answer for a language (its parallel, or its meaning when
 * there is no parallel) or the explanation has only one entry.
 */
export function multipleMeaningsWarnings(item: ItemContent): ItemIssue[] {
  if (!item.multipleMeanings) return [];
  const issues: ItemIssue[] = [];
  const message = 'Multiple meanings is on, but this list has only one entry';
  const codes = new Set([...Object.keys(item.parallel), ...Object.keys(item.meaning)]);
  for (const code of codes) {
    const kind = item.parallel[code as LangCode]?.length ? 'parallel' : 'meaning';
    if (item[kind][code as LangCode]?.length === 1) {
      issues.push({ path: `${kind}.${code}`, code: 'MULTIPLE_MEANINGS_SINGLE_ENTRY', message });
    }
  }
  if (item.explanation.length === 1) {
    issues.push({ path: 'explanation', code: 'MULTIPLE_MEANINGS_SINGLE_ENTRY', message });
  }
  return issues;
}

function scriptIssue(path: string, text: string, script: string | undefined): ItemIssue[] {
  if (!script) return [];
  const letters = foreignLetters(text, script);
  if (letters.length === 0) return [];
  return [
    {
      path,
      code: 'MIXED_SCRIPT',
      message: `Contains letters from another alphabet: ${letters.join(' ')}`,
    },
  ];
}

/** Letters from a different script than the language of the text (PRD FR-A11). */
export function mixedScriptWarnings(item: ItemContent, languages: LanguageMap): ItemIssue[] {
  const own = languages[item.lang]?.script;
  const issues: ItemIssue[] = [...scriptIssue('text', item.text, own)];
  for (const list of OWN_LANGUAGE_LISTS) {
    item[list].forEach((entry, i) => issues.push(...scriptIssue(`${list}[${i}]`, entry, own)));
  }
  for (const list of TRANSLATION_KINDS) {
    for (const [code, entries] of Object.entries(item[list])) {
      const script = languages[code as LangCode]?.script;
      entries.forEach((entry, i) =>
        issues.push(...scriptIssue(`${list}.${code}[${i}]`, entry, script)),
      );
    }
  }
  return issues;
}
