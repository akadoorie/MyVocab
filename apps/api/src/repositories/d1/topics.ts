import { asc } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { topics } from '../../db/schema';
import type { TopicRepository, TopicRow } from '../interfaces';

export class D1TopicRepository implements TopicRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<TopicRow[]> {
    return this.db
      .select({
        id: topics.id,
        slug: topics.slug,
        name: topics.name,
        isActive: topics.isActive,
        sortOrder: topics.sortOrder,
        excludesTopicId: topics.excludesTopicId,
      })
      .from(topics)
      .orderBy(asc(topics.sortOrder), asc(topics.name));
  }
}
