/** A language code from the `languages` table, e.g. 'en' or 'he' (PRD §11.1). */
export type LangCode = string;

export type TextDir = 'ltr' | 'rtl';

/** What the domain needs to know about a language (from the `languages` table). */
export type LanguageInfo = {
  code: LangCode;
  dir: TextDir;
  /** ISO 15924 script code, e.g. 'Latn', 'Hebr' (used for mixed-script warnings). */
  script: string;
};

export type LanguageMap = Readonly<Record<LangCode, LanguageInfo>>;

/** Language codes are lowercase ISO 639-1, optionally with a region: 'en', 'he', 'pt-br'. */
const LANG_CODE_PATTERN = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

export function isValidLangCode(value: string): boolean {
  return LANG_CODE_PATTERN.test(value);
}

/** Builds a lookup map from a list of languages. */
export function toLanguageMap(languages: readonly LanguageInfo[]): LanguageMap {
  return Object.fromEntries(languages.map((l) => [l.code, l]));
}
