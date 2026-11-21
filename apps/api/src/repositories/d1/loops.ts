import type { ItemData, Translations } from '@myvocab/core';
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type { LoopRepository, LoopSelection } from '../interfaces';

type Row = {
  id: number;
  lang: string;
  text: string;
  multiple_meanings: number;
  parallel: string;
  meaning: string;
  literal: string;
  explanation: string;
  synonyms: string;
  hints: string;
};

/**
 * Loop selection (PRD §11.3). The playability rule mirrors the core AnswerStrategy
 * (`isPlayable`); an integration test checks that both agree.
 */
function whereClause(s: LoopSelection): SQL {
  const answer =
    s.source === s.target
      ? sql`json_array_length(i.explanation) > 0`
      : sql`COALESCE(json_array_length(i.translation_meaning, '$."' || ${s.target} || '"'), 0) > 0`;
  const known = s.userId
    ? // Known only in this direction hides it (D-028); the primary key covers the lookup.
      sql`AND NOT EXISTS (SELECT 1 FROM user_known_items k
          WHERE k.user_id = ${s.userId} AND k.item_id = i.id AND k.known_target = ${s.target})`
    : sql``;
  const sample = s.sampleOnly ? sql`AND i.in_sample_set = 1` : sql``;
  return sql`i.lang = ${s.source}
    AND i.status = 'published' AND i.deleted_at IS NULL
    AND ${answer} ${known} ${sample}`;
}

/** With a topic, start from its links so only that topic's items are read. */
function fromClause(s: LoopSelection): SQL {
  return s.topicId === null
    ? sql`FROM items AS i`
    : sql`FROM item_topics AS ic JOIN items AS i ON i.id = ic.item_id AND ic.topic_id = ${s.topicId}`;
}

export class D1LoopRepository implements LoopRepository {
  constructor(private readonly db: Db) {}

  async countPlayable(s: LoopSelection): Promise<number> {
    const row = await this.db.get<{ n: number }>(
      sql`SELECT COUNT(*) AS n ${fromClause(s)} WHERE ${whereClause(s)}`,
    );
    return row?.n ?? 0;
  }

  async selectPlayable(s: LoopSelection, limit: number): Promise<ItemData[]> {
    const rows = await this.db.all<Row>(sql`
      SELECT i.id, i.lang, i.text, i.multiple_meanings, i.translation_parallel AS parallel, i.translation_meaning AS meaning,
      i.translation_literal AS literal,
             i.explanation,
             i.synonyms, i.hints
      ${fromClause(s)}
      WHERE ${whereClause(s)}
      ORDER BY RANDOM()
      LIMIT ${limit}
    `);
    return rows.map((r) => ({
      id: r.id,
      lang: r.lang,
      text: r.text,
      multipleMeanings: r.multiple_meanings === 1,
      parallel: JSON.parse(r.parallel) as Translations,
      meaning: JSON.parse(r.meaning) as Translations,
      literal: JSON.parse(r.literal) as Translations,
      explanation: JSON.parse(r.explanation) as string[],
      synonyms: JSON.parse(r.synonyms) as string[],
      hints: JSON.parse(r.hints) as string[],
    }));
  }
}
