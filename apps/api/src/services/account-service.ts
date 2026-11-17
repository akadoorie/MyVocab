import { ConflictError, NotFoundError } from '../middleware/errors';
import type { AccountRepository } from '../repositories/interfaces';

/** The learner's own account (PRD §6.6). */
export class AccountService {
  constructor(private readonly deps: { accounts: AccountRepository; now?: () => number }) {}

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
