import { itemIdentityKey, type Translations } from '@myvocab/core';
import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type { ExistingItemWithVersion, IdentityKey, ItemRepository } from '../interfaces';

type IdentityRow = {
  id: number;
  lang: string;
  text: string;
  type: 'word' | 'expr';
  multiple_meanings: number;
  parallel: string;
  meaning: string;
  literal: string;
  explanation: string;
  synonyms: string;
  hints: string;
  in_sample_set: number;
  version: number;
  topics: string | null;
};

export class D1ItemRepository implements ItemRepository {
  constructor(private readonly db: Db) {}

  /**
   * One query for any number of keys: the keys travel as a single JSON parameter and are joined
   * against the unique identity index (PRD §11.2: few rows read, few queries per invocation).
   */
  async findByIdentities(
    keys: readonly IdentityKey[],
  ): Promise<Map<string, ExistingItemWithVersion>> {
    const result = new Map<string, ExistingItemWithVersion>();
    if (keys.length === 0) return result;
    const json = JSON.stringify(keys.map((k) => [k.lang, k.type, k.normalizedText]));
    const rows = await this.db.all<IdentityRow>(sql`
      SELECT i.id, i.lang, i.text, i.type, i.multiple_meanings, i.translation_parallel AS parallel, i.translation_meaning AS meaning,
      i.translation_literal AS literal,
             i.explanation,
             i.synonyms, i.hints, i.in_sample_set, i.version,
             (SELECT group_concat(c.slug, ' ') FROM item_topics ic
                JOIN topics c ON c.id = ic.topic_id WHERE ic.item_id = i.id) AS topics
      FROM json_each(${json}) AS k
      JOIN items AS i
        ON i.lang = json_extract(k.value, '$[0]')
       AND i.type = json_extract(k.value, '$[1]')
       AND i.normalized_text = json_extract(k.value, '$[2]')
       AND i.deleted_at IS NULL
    `);
    for (const r of rows) {
      result.set(itemIdentityKey(r.lang, r.text, r.type), {
        id: r.id,
        version: r.version,
        inSampleSet: r.in_sample_set === 1,
        topics: r.topics ? r.topics.split(' ') : [],
        content: {
          lang: r.lang,
          text: r.text,
          type: r.type,
          multipleMeanings: r.multiple_meanings === 1,
          parallel: JSON.parse(r.parallel) as Translations,
          meaning: JSON.parse(r.meaning) as Translations,
          literal: JSON.parse(r.literal) as Translations,
          explanation: JSON.parse(r.explanation) as string[],
          synonyms: JSON.parse(r.synonyms) as string[],
          hints: JSON.parse(r.hints) as string[],
        },
      });
    }
    return result;
  }
}
