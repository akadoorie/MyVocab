import type { AuditEntryView, AuditQuery } from '@myvocab/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { adminStrings as s } from '../../strings-admin';
import { useDebounced } from '../setup/useDebounced';
import { adminApi } from './admin-api';
import {
  ErrorState,
  Field,
  formatDateTime,
  ghostButton,
  inputClass,
  Loading,
  PageTitle,
} from './ui';

/** `/admin/audit` (FR-A70): read-only, filters, detail JSON. */
export function AuditPage() {
  const ids = { actor: useId(), action: useId(), type: useId(), from: useId(), to: useId() };
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters = useDebounced(
    { actor: actor.trim(), action: action.trim(), entityType: entityType.trim(), from, to },
    300,
  );
  const q: AuditQuery = {
    ...(filters.actor ? { actor: filters.actor } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.from ? { from: new Date(`${filters.from}T00:00:00`).getTime() } : {}),
    ...(filters.to ? { to: new Date(`${filters.to}T23:59:59.999`).getTime() } : {}),
  };
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit', q],
    queryFn: ({ pageParam }) =>
      adminApi.audit({ ...q, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const entries = list.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.audit.title}</PageTitle>
      <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-border bg-surface p-4 lg:grid-cols-5">
        <Field id={ids.actor} label={s.audit.actor} className="col-span-2 lg:col-span-1">
          <input
            autoComplete="off"
            id={ids.actor}
            value={actor}
            maxLength={200}
            onChange={(e) => setActor(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id={ids.action} label={s.audit.action}>
          <input
            autoComplete="off"
            id={ids.action}
            value={action}
            maxLength={60}
            placeholder="item."
            onChange={(e) => setAction(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id={ids.type} label={s.audit.entityType}>
          <input
            autoComplete="off"
            id={ids.type}
            value={entityType}
            maxLength={40}
            placeholder="item"
            onChange={(e) => setEntityType(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id={ids.from} label={s.audit.from}>
          <input
            id={ids.from}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id={ids.to} label={s.audit.to}>
          <input
            id={ids.to}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.audit.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.audit.title}>
          {entries.map((e) => (
            <AuditRow key={e.id} entry={e} />
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
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntryView }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <li className="rounded-[14px] border border-border bg-surface p-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-4">
        <span className="text-sm text-muted md:w-44">{formatDateTime(entry.createdAt)}</span>
        <span className="font-mono text-sm">{entry.action}</span>
        <span className="text-sm text-muted">
          {entry.entityType}
          {entry.entityId ? ` #${entry.entityId}` : ''}
        </span>
        <span className="truncate text-sm text-muted md:ml-auto">
          {entry.actorEmail ?? entry.actorUserId ?? s.audit.system}
        </span>
        {entry.details !== null && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-accent"
          >
            {open ? s.audit.hideDetails : s.audit.details}
          </button>
        )}
      </div>
      {open && (
        <pre
          id={detailsId}
          className="mt-3 max-h-96 overflow-auto rounded-[10px] bg-surface-2 p-3 text-xs"
        >
          {JSON.stringify(entry.details, null, 2)}
        </pre>
      )}
    </li>
  );
}
