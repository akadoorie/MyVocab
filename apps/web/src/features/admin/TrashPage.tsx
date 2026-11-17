import type { TrashItem } from '@myvocab/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { strings } from '../../strings';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage } from './admin-api';
import { ErrorState, formatDateTime, ghostButton, Loading, PageTitle } from './ui';

function purgesIn(purgeAt: number, now: number): string {
  const ms = purgeAt - now;
  if (ms <= 0) return s.trash.purgeSoon;
  const minutes = Math.ceil(ms / 60_000);
  return s.trash.purgesIn(Math.floor(minutes / 60), minutes % 60);
}

/** `/admin/trash` (FR-A20–22). */
export function TrashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const trash = useQuery({ queryKey: ['admin', 'trash'], queryFn: adminApi.trash });
  const [purging, setPurging] = useState<TrashItem | null>(null);
  const [now] = useState(() => Date.now());

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin'] });
  const restore = useMutation({
    mutationFn: (id: number) => adminApi.restore(id),
    onSuccess: () => {
      toast.show({ message: s.trash.restored });
      refresh();
    },
    onError: (e) =>
      toast.show({ message: errorMessage(e, s.common.genericError), durationMs: 8000 }),
  });
  const purge = useMutation({
    mutationFn: (id: number) => adminApi.purge(id),
    onSuccess: () => {
      toast.show({ message: s.trash.purged });
      setPurging(null);
      refresh();
    },
    onError: (e) => {
      setPurging(null);
      toast.show({ message: errorMessage(e, s.common.genericError) });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.trash.title}</PageTitle>
      {trash.data && (
        <p className="text-sm text-muted">{s.trash.retention(trash.data.retentionHours)}</p>
      )}
      {trash.isPending ? (
        <Loading />
      ) : trash.isError ? (
        <ErrorState onRetry={() => void trash.refetch()} />
      ) : trash.data.items.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.trash.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.trash.title}>
          {trash.data.items.map((item) => (
            <li
              key={item.itemId}
              className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-4 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-2">
                  <bdi lang={item.lang} dir={item.dir} className="font-semibold break-words">
                    {item.text}
                  </bdi>
                  <span className="text-xs text-muted">
                    {item.lang.toUpperCase()} · {strings.types[item.type]}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  {s.trash.deletedAt(formatDateTime(item.deletedAt))}
                  {item.deletedBy && ` · ${s.trash.deletedBy(item.deletedBy.name)}`} ·{' '}
                  <span className="text-hint">{purgesIn(item.purgeAt, now)}</span>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={ghostButton}
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(item.itemId)}
                >
                  {s.trash.restore}
                </button>
                <button
                  type="button"
                  className={`${ghostButton} text-dontknow`}
                  onClick={() => setPurging(item)}
                >
                  {s.trash.purge}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {purging && (
        <ConfirmDialog
          title={s.trash.purgeTitle(purging.text)}
          body={s.trash.purgeBody}
          confirmLabel={s.trash.purge}
          cancelLabel={s.common.cancel}
          requireText="PURGE"
          requireTextLabel={s.trash.purgeConfirmLabel}
          danger
          busy={purge.isPending}
          onConfirm={() => purge.mutate(purging.itemId)}
          onCancel={() => setPurging(null)}
        />
      )}
    </div>
  );
}
