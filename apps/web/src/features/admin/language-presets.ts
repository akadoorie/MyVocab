import type { LanguageCreate } from '@myvocab/contracts';

/**
 * Ready-made details for "Add a language" (D-027): picking one fills the form, which stays
 * editable; "Other" leaves it empty. Every script here is a Unicode script property (core
 * `isSupportedScript`), so the mixed-script check works for it. Sorted by English name.
 */
export const LANGUAGE_PRESETS: readonly LanguageCreate[] = [
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl', script: 'Arab' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', dir: 'ltr', script: 'Hani' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr', script: 'Latn' },
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', script: 'Latn' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', script: 'Latn' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', script: 'Latn' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', dir: 'ltr', script: 'Grek' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl', script: 'Hebr' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr', script: 'Deva' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr', script: 'Latn' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl', script: 'Arab' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr', script: 'Latn' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', script: 'Latn' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', dir: 'ltr', script: 'Latn' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', script: 'Cyrl' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', script: 'Latn' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', dir: 'ltr', script: 'Thai' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr', script: 'Latn' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr', script: 'Cyrl' },
  { code: 'yi', name: 'Yiddish', nativeName: 'ייִדיש', dir: 'rtl', script: 'Hebr' },
];
