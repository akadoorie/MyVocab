import type { AdminUser, AdminUserPatch } from '@myvocab/contracts';
import { z } from 'zod';
import { isOwnerEmail } from '../../auth/auth';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/errors';
import type {
  Actor,
  AdminUserRepository,
  AdminUserRow,
  AuditDetails,
} from '../../repositories/interfaces';

const PAGE = 50;
const cursorSchema = z.tuple([z.number().int(), z.string().max(200)]);

function encodeCursor(row: AdminUserRow): string {
  return btoa(JSON.stringify([row.createdAt, row.id]));
}

function decodeCursor(value: string): { createdAt: number; id: string } {
  try {
    const [createdAt, id] = cursorSchema.parse(JSON.parse(atob(value)));
    return { createdAt, id };
  } catch {
    throw new ValidationError('Invalid cursor');
  }
}

/** Users (FR-A40–42): roles and bans with the owner / self / last-admin rules. */
export class UserAdminService {
  constructor(
    private readonly deps: {
      users: AdminUserRepository;
      owners: ReadonlySet<string>;
      now?: () => number;
    },
  ) {}

  private view(row: AdminUserRow): AdminUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      role: row.role === 'admin' ? 'admin' : 'user',
      isOwner: isOwnerEmail(row, this.deps.owners),
      banned: row.banned,
      banReason: row.banReason,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
    };
  }

  async list(q: string | undefined, cursor: string | undefined) {
    const rows = await this.deps.users.list(q, cursor ? decodeCursor(cursor) : null, PAGE + 1);
    const page = rows.slice(0, PAGE);
    const last = page.at(-1);
    return {
      users: page.map((r) => this.view(r)),
      nextCursor: rows.length > PAGE && last ? encodeCursor(last) : null,
    };
  }

  async update(id: string, patch: AdminUserPatch, actor: Actor): Promise<AdminUser> {
    const target = await this.deps.users.get(id);
    if (!target) throw new NotFoundError('User not found');
    const isOwner = isOwnerEmail(target, this.deps.owners);
    const isSelf = actor?.userId === id;
    const changes: { role?: string; banned?: boolean; banReason?: string | null } = {};
    const audits: AuditDetails[] = [];

    if (patch.role !== undefined && patch.role !== target.role) {
      if (patch.role === 'user') {
        if (isOwner) throw new ConflictError('Owners can’t be demoted');
        if (isSelf) throw new ConflictError('You can’t remove your own admin role');
        if (!target.banned && (await this.deps.users.countActiveAdmins()) <= 1) {
          throw new ConflictError('The last admin can’t be demoted');
        }
      }
      changes.role = patch.role;
      audits.push({
        action: 'user.role_change',
        details: { before: target.role, after: patch.role },
      });
    }

    if (patch.banned !== undefined && patch.banned !== target.banned) {
      if (patch.banned) {
        if (isSelf) throw new ConflictError('You can’t ban yourself');
        if (isOwner) throw new ConflictError('Owners can’t be banned');
      }
      changes.banned = patch.banned;
      changes.banReason = patch.banned ? (patch.banReason ?? null) : null;
      audits.push(
        patch.banned
          ? { action: 'user.ban', details: { reason: patch.banReason ?? null } }
          : { action: 'user.unban', details: null },
      );
    }

    if (audits.length > 0) {
      await this.deps.users.apply(id, changes, audits, actor, (this.deps.now ?? Date.now)());
    }
    const updated = await this.deps.users.get(id);
    if (!updated) throw new NotFoundError('User not found');
    return this.view(updated);
  }
}
