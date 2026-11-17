import { asc } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { categories } from '../../db/schema';
import type { CategoryRepository, CategoryRow } from '../interfaces';

export class D1CategoryRepository implements CategoryRepository {
  constructor(private readonly db: Db) {}

  async listAll(): Promise<CategoryRow[]> {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        isActive: categories.isActive,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }
}
