/** A language code from the `languages` table, e.g. 'en' or 'he' (PRD §11.1). */
export type LangCode = string;

export type TextDir = 'ltr' | 'rtl';

/** Language codes are lowercase ISO 639-1, optionally with a region: 'en', 'he', 'pt-br'. */
const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

export function isValidLangCode(value: string): boolean {
  return LANG_CODE_PATTERN.test(value);
}
