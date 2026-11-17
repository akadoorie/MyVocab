import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { ItemAdminService } from './admin/item-admin-service';
import { dayPeriod, hourPeriod } from './usage-limit-service';

const HOUR = 60 * 60 * 1000;
/** Usage counters are kept 48 hours (PRD §11.1). */
export const USAGE_RETENTION_MS = 48 * HOUR;

/** The hourly Cron Trigger (PRD FR-A23, §11.1): Trash purge, counter and session cleanup. */
export class MaintenanceService {
  constructor(private readonly deps: { db: Db; items: ItemAdminService; now?: () => number }) {}

  async hourly(): Promise<{ purged: number; usageRows: number; sessions: number }> {
    const now = (this.deps.now ?? Date.now)();
    const purged = await this.deps.items.purgeExpired();
    const cutoff = now - USAGE_RETENTION_MS;
    // Periods sort as text: 'h:2026-11-16T14' and 'd:2026-11-16'.
    const usage = await this.deps.db.run(sql`
      DELETE FROM usage_counters
      WHERE (period LIKE 'h:%' AND period < ${hourPeriod(cutoff)})
         OR (period LIKE 'd:%' AND period < ${dayPeriod(cutoff)})
    `);
    const sessions = await this.deps.db.run(sql`DELETE FROM session WHERE expires_at < ${now}`);
    await this.deps.db.run(sql`DELETE FROM verification WHERE expires_at < ${now}`);
    return { purged, usageRows: usage.meta.changes, sessions: sessions.meta.changes };
  }
}
