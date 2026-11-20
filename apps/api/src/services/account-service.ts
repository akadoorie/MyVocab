import { ConflictError, NotFoundError } from '../middleware/errors';
import type { AccountRepository } from '../repositories/interfaces';

/** How long a registered-users count is kept before counting again (D-036). */
export const REGISTERED_USERS_TTL_MS = 30 * 60 * 1000;

/**
 * The last count, kept in this Worker instance's memory: counting reads every user row, so
 * home page visits share one count per 30 minutes (each running instance keeps its own).
 */
let registeredUsersCache: { n: number; at: number } | null = null;

/** Tests only: forget the kept count. */
export function resetRegisteredUsersCache(): void {
  registeredUsersCache = null;
}

/** The learner's own account (PRD §6.6). */
export class AccountService {
  constructor(private readonly deps: { accounts: AccountRepository; now?: () => number }) {}

  /** The home page count of registered users (not admins, not banned), kept 30 minutes. */
  async registeredUsers(): Promise<number> {
    const now = (this.deps.now ?? Date.now)();
    if (registeredUsersCache && now - registeredUsersCache.at < REGISTERED_USERS_TTL_MS) {
      return registeredUsersCache.n;
    }
    const n = await this.deps.accounts.countRegisteredUsers();
    registeredUsersCache = { n, at: now };
    return n;
  }

  /**
   * FR-L71: deletes the user, their sessions, accounts, known items and usage counters. The last
   * admin (owner or not) can't delete themselves.
   */
  async deleteAccount(userId: string): Promise<void> {
    const account = await this.deps.accounts.find(userId);
    if (!account) throw new NotFoundError('Account not found');
    if (account.role === 'admin' && (await this.deps.accounts.countActiveAdmins()) <= 1) {
      throw new ConflictError(
        'You are the last admin. Make another user an admin before deleting your account.',
      );
    }
    await this.deps.accounts.deleteUser(userId, (this.deps.now ?? Date.now)());
  }
}
