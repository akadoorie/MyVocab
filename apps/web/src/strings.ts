/**
 * Every learner-facing UI string lives in `strings.en.ts` and `strings.he.ts` (PRD §9.8, D-080);
 * components read the active language's through `strings`. Admin strings stay English
 * (`strings-admin.ts`).
 */
import { en, type Strings } from './strings.en';
import { he } from './strings.he';

export type { Strings };
export type Locale = 'he' | 'en';
export const LOCALES: readonly Locale[] = ['he', 'en'];

/**
 * The active strings: a live binding that `activateLocale` swaps. `LocaleProvider` re-mounts the
 * app when it changes, so every component renders with the new ones. English until the app picks
 * a locale, so unit tests see English unless they ask for Hebrew.
 */
export let strings: Strings = en;
export let activeLocale: Locale = 'en';

export function activateLocale(locale: Locale): void {
  activeLocale = locale;
  strings = locale === 'he' ? he : en;
}

export const isLocale = (v: unknown): v is Locale => v === 'he' || v === 'en';

/** A language's name in the UI language; codes we have no name for keep the server's name. */
export function languageName(lang: { code: string; name: string }): string {
  return strings.languageNames[lang.code] ?? lang.name;
}

/** A topic's name in the UI language: the Hebrew UI uses `nameHe` when the admin set one. */
export function topicName(topic: { name: string; nameHe: string | null }): string {
  return activeLocale === 'he' && topic.nameHe ? topic.nameHe : topic.name;
}

/** For `toLocaleDateString`: Hebrew dates in the Hebrew UI, the browser's format otherwise. */
export function dateLocale(): string | undefined {
  return activeLocale === 'he' ? 'he-IL' : undefined;
}
