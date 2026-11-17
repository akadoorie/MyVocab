import { and, count, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { auditLog, usageCounters, user } from '../../db/schema';
import type { AccountRepository, AccountRow } from '../interfaces';

export class D1AccountRepository implements AccountRepository {
  constructor(private readonly db: Db) {}

  async find(userId: string): Promise<AccountRow | null> {
    const row = await this.db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.id, userId))
      .get();
    return row ?? null;
  }

  async countActiveAdmins(): Promise<number> {
    const row = await this.db
      .select({ n: count() })
      .from(user)
      .where(and(eq(user.role, 'admin'), eq(user.banned, false)))
      .get();
    return row?.n ?? 0;
  }

  async deleteUser(userId: string, now: number): Promise<void> {
    // One batch = one transaction. Sessions, accounts and known items go by FK cascade.
    await this.db.batch([
      this.db
        .delete(usageCounters)
        .where(inArray(usageCounters.subject, [`user:${userId}`, `blocked:user:${userId}`])),
      this.db.delete(user).where(eq(user.id, userId)),
      // The id only: no email or name is kept for a deleted account.
      this.db.insert(auditLog).values({
        actorUserId: userId,
        actorEmail: null,
        action: 'user.self_delete',
        entityType: 'user',
        entityId: userId,
        details: null,
        createdAt: now,
      }),
    ]);
  }
}
