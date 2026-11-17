import type { Db } from '../../db/client';
import { auditLog } from '../../db/schema';
import type { AuditEntry, AuditRepository } from '../interfaces';

export class D1AuditRepository implements AuditRepository {
  constructor(private readonly db: Db) {}

  async insert(entry: AuditEntry, now: number): Promise<void> {
    await this.db.insert(auditLog).values({
      actorUserId: entry.actor?.userId ?? null,
      actorEmail: entry.actor?.email ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      details: entry.details ?? null,
      createdAt: now,
    });
  }
}
