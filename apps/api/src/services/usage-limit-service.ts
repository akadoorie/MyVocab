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

  /** Guests: `limit` practices per hour per hashed IP. */
  async checkGuestPractice(ipHash: string, limit: number): Promise<LimitDecision> {
    const subject = `ip:${ipHash}`;
    const period = hourPeriod(this.now());
    const used = await this.usage.get(subject, period);
    if (used < limit) return { allowed: true };
    await this.recordBlock(subject, period, { kind: 'guest.practicesPerHour', limit });
    return { allowed: false, remaining: 0 };
  }

  async recordGuestPractice(ipHash: string): Promise<void> {
    const now = this.now();
    await this.usage.increment(`ip:${ipHash}`, hourPeriod(now), 1, now);
  }

  /** Learners: at most `limit` cards served per UTC day. */
  async checkLearnerCards(
    userId: string,
    requested: number,
    limit: number,
  ): Promise<LimitDecision> {
    const subject = `user:${userId}`;
    const period = dayPeriod(this.now());
    const used = await this.usage.get(subject, period);
    if (used + requested <= limit) return { allowed: true };
    await this.recordBlock(subject, period, { kind: 'users.cardsPerDay', limit });
    return { allowed: false, remaining: Math.max(0, limit - used) };
  }

  async recordLearnerCards(userId: string, served: number): Promise<void> {
    if (served <= 0) return;
    const now = this.now();
    await this.usage.increment(`user:${userId}`, dayPeriod(now), served, now);
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
