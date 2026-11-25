import type { AuditRepository, UsageRepository } from '../repositories/interfaces';

/**
 * Anti-scraping caps (PRD §14.3) with write discipline (PRD §11.2 rule 5):
 * - limits are checked before incrementing, so an over-limit request writes nothing;
 * - the first block per subject and period writes one marker row and one `limit.exceeded` audit
 *   entry, later blocks write nothing.
 */

export type Clock = () => number;

export function hourPeriod(now: number): string {
  return `h:${new Date(now).toISOString().slice(0, 13)}`;
}

export function dayPeriod(now: number): string {
  return `d:${new Date(now).toISOString().slice(0, 10)}`;
}

/** HMAC-SHA256 of the IP: raw IPs are never stored (PRD §14.3). */
export async function hashIp(ip: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type LimitDecision = { allowed: true } | { allowed: false; remaining: number };

export class UsageLimitService {
  constructor(
    private readonly usage: UsageRepository,
    private readonly audit: AuditRepository,
    private readonly now: Clock = Date.now,
  ) {}

  /**
   * Guests: `limit` practices per hour per hashed IP. Checks and counts the practice in one step,
   * so parallel requests can't all pass the check before any is counted.
   */
  async consumeGuestPractice(ipHash: string, limit: number): Promise<LimitDecision> {
    const subject = `ip:${ipHash}`;
    const now = this.now();
    const period = hourPeriod(now);
    if (await this.usage.tryIncrement(subject, period, 1, limit, now)) return { allowed: true };
    await this.recordBlock(subject, period, { kind: 'guest.practicesPerHour', limit });
    return { allowed: false, remaining: 0 };
  }

  /** Learners: reserves `requested` cards of the `limit` per UTC day, in one step. */
  async reserveLearnerCards(
    userId: string,
    requested: number,
    limit: number,
  ): Promise<LimitDecision> {
    const subject = `user:${userId}`;
    const now = this.now();
    const period = dayPeriod(now);
    if (await this.usage.tryIncrement(subject, period, requested, limit, now)) {
      return { allowed: true };
    }
    await this.recordBlock(subject, period, { kind: 'users.cardsPerDay', limit });
    const used = await this.usage.get(subject, period);
    return { allowed: false, remaining: Math.max(0, limit - used) };
  }

  /**
   * Gives back what a reservation didn't use (fewer cards were available than reserved), so the
   * day's count is the cards actually served. Writes only when there is something to give back.
   */
  async releaseLearnerCards(userId: string, unused: number): Promise<void> {
    if (unused <= 0) return;
    const now = this.now();
    await this.usage.increment(`user:${userId}`, dayPeriod(now), -unused, now);
  }

  private async recordBlock(subject: string, period: string, details: Record<string, unknown>) {
    const now = this.now();
    if (await this.usage.markOnce(`blocked:${subject}`, period, now)) {
      // Subject hash or user id only; never an IP (PRD §12.1).
      await this.audit.insert(
        {
          actor: null,
          action: 'limit.exceeded',
          entityType: 'usage',
          entityId: subject,
          details: { ...details, period },
        },
        now,
      );
    }
  }
}
