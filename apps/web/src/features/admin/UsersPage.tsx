import type { AdminUser, AdminUserPatch } from '@myvocab/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { Avatar } from '../../components/UserMenu';
import { useSession } from '../../lib/session';
import { adminStrings as s } from '../../strings-admin';
import { useDebounced } from '../setup/useDebounced';
import { adminApi, errorMessage } from './admin-api';
import {
  Badge,
  ErrorState,
  Field,
  formatDate,
  ghostButton,
  inputClass,
  Loading,
  PageTitle,
} from './ui';

/** `/admin/users` (FR-A40–42). The server enforces the owner / self / last-admin rules. */
export function UsersPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useSession().user;
  const searchId = useId();
  const reasonId = useId();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [banning, setBanning] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');

  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', q],
    queryFn: ({ pageParam }) =>
      adminApi.users({ ...(q ? { q } : {}), ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const patch = useMutation({
    mutationFn: (v: { id: string; body: AdminUserPatch }) => adminApi.patchUser(v.id, v.body),
    onSuccess: () => {
      toast.show({ message: s.users.updated });
      setBanning(null);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => {
      setBanning(null);
      toast.show({ message: errorMessage(e, s.common.genericError), durationMs: 8000 });
    },
  });
  const users = list.data?.pages.flatMap((p) => p.users) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.users.title}</PageTitle>
      <Field id={searchId} label={s.common.search} className="max-w-md">
        <input
          id={searchId}
          type="search"
          value={search}
          maxLength={100}
          placeholder={s.users.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
      </Field>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.users.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.users.title}>
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 md:flex-row md:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={40} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <span className="truncate">{u.name}</span>
                    {u.id === me?.id && <Badge>{s.users.you}</Badge>}
                    {u.role === 'admin' && <Badge tone="accent">{s.users.admin}</Badge>}
                    {u.isOwner && <Badge tone="hint">{s.users.owner}</Badge>}
                    {u.banned && <Badge tone="dontknow">{s.users.banned}</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                  <p className="text-xs text-muted">
                    {s.users.joined(formatDate(u.createdAt))} ·{' '}
                    {u.lastSeenAt ? s.users.lastSeen(formatDate(u.lastSeenAt)) : s.users.neverSeen}
                    {u.banReason && ` · ${u.banReason}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={ghostButton}
                  disabled={patch.isPending}
                  onClick={() =>
                    patch.mutate({
                      id: u.id,
                      body: { role: u.role === 'admin' ? 'user' : 'admin' },
                    })
                  }
                >
                  {u.role === 'admin' ? s.users.removeAdmin : s.users.makeAdmin}
                </button>
                {u.banned ? (
                  <button
                    type="button"
                    className={ghostButton}
                    disabled={patch.isPending}
                    onClick={() => patch.mutate({ id: u.id, body: { banned: false } })}
                  >
                    {s.users.unban}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${ghostButton} text-dontknow`}
                    onClick={() => setBanning(u)}
                  >
                    {s.users.ban}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            className={ghostButton}
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? s.common.loading : s.common.loadMore}
          </button>
        </div>
      )}
      {banning && (
        <ConfirmDialog
          title={s.users.banTitle(banning.name)}
          body={s.users.banBody}
          confirmLabel={s.users.ban}
          cancelLabel={s.common.cancel}
          danger
          busy={patch.isPending}
          onConfirm={() =>
            patch.mutate({
              id: banning.id,
              body: { banned: true, ...(reason.trim() ? { banReason: reason.trim() } : {}) },
            })
          }
          onCancel={() => setBanning(null)}
        >
          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm text-muted">
              {s.users.banReason}
            </label>
            <input
              id={reasonId}
              value={reason}
              maxLength={200}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
            />
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
