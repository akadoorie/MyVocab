import type { LangCode } from '../lang/languages';
import { normalize } from '../text/normalize';

/**
 * The identity of an item: same language + normalized text (PRD §8.3, §11.1
 * `ux_items_identity`; D-046 dropped the type). Used for uniqueness checks and CSV merges.
 */
export function itemIdentityKey(lang: LangCode, text: string): string {
  return `${lang}${String.fromCharCode(0)}${normalize(text)}`;
}
