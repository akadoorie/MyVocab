import type { LangCode } from '../lang/languages';
import { normalize } from '../text/normalize';
import type { ItemType } from './types';

/**
 * The identity of an item: same language + normalized text + type (PRD §8.3, §11.1
 * `ux_items_identity`). Used for uniqueness checks and CSV merges.
 */
export function itemIdentityKey(lang: LangCode, text: string, type: ItemType): string {
  return `${lang}\u0000${type}\u0000${normalize(text)}`;
}
