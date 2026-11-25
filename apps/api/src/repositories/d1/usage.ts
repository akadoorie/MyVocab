import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { usageCounters } from '../../db/schema';
import type { UsageRepository } from '../interfaces';

export class D1UsageRepository implements UsageRepository {
  constructor(private readonly db: Db) {}

  async get(subject: string, period: string): Promise<number> {
    const row = await this.db
      .select({ count: usageCounters.count })
      .from(usageCounters)
      .where(and(eq(usageCounters.subject, subject), eq(usageCounters.period, period)))
      .get();
    return row?.count ?? 0;
  }

  async increment(subject: string, period: string, by: number, now: number): Promise<void> {
    await this.db
      .insert(usageCounters)
      .values({ subject, period, count: by, updatedAt: now })
      .onConflictDoUpdate({
        target: [usageCounters.subject, usageCounters.period],
        set: { count: sql`${usageCounters.count} + ${by}`, updatedAt: now },
      });
  }

  async tryIncrement(
    subject: string,
    period: string,
    by: number,
    limit: number,
    now: number,
  ): Promise<boolean> {
    if (by > limit) return false;
    const res = await this.db.run(sql`
      INSERT INTO usage_counters (subject, period, count, updated_at)
      VALUES (${subject}, ${period}, ${by}, ${now})
      ON CONFLICT (subject, period) DO UPDATE
        SET count = usage_counters.count + excluded.count, updated_at = excluded.updated_at
        WHERE usage_counters.count + excluded.count <= ${limit}
    `);
    return res.meta.changes === 1;
  }

  async markOnce(subject: string, period: string, now: number): Promise<boolean> {
    const res = await this.db
      .insert(usageCounters)
      .values({ subject, period, count: 1, updatedAt: now })
      .onConflictDoNothing();
    return res.meta.changes === 1;
  }
}
