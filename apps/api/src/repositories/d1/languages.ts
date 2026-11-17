import { asc } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { languages } from '../../db/schema';
import type { LanguageRepository, LanguageRow } from '../interfaces';

export class D1LanguageRepository implements LanguageRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<LanguageRow[]> {
    return this.db.select().from(languages).orderBy(asc(languages.sortOrder), asc(languages.code));
  }
}
