import type { KnownFilter, KnownItem, KnownSort, RestoreKnownRequest } from '@myvocab/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button3D } from '../../components/Button3D';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SignInPrompt } from '../../components/SignInPrompt';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { strings } from '../../strings';
import { useDebounced } from '../setup/useDebounced';
import { useKnownQueue } from './KnownQueueProvider';

/** "My known words" (PRD §6.5, `/known`). */
export function KnownPage() {
  const session = useSession();
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-12">
      {session.loading ? (
        <div className="h-64 animate-pulse rounded-[14px] bg-surface" aria-busy="true" />
      ) : session.user ? (
        <KnownList />
      ) : (
        <SignInPrompt />
      )}
    </main>
  );
}

const selectClass =
  'min-h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-base focus-visible:ring-2 focus-visible:ring-accent outline-none';

function KnownList() {
  const queryClient = useQueryClient();
  const queue = useKnownQueue();
  const toast = useToast();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 });
  const ids = { search: useId(), lang: useId(), type: useId(), category: useId(), sort: useId() };

  const [search, setSearch] = useState('');
  const [lang, setLang] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState<KnownSort>('newest');
  const q = useDebounced(search.trim(), 300);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const filter: KnownFilter = useMemo(
    () => ({
      ...(q ? { q } : {}),
      ...(lang ? { lang } : {}),
      ...(type === 'word' || type === 'expr' ? { type } : {}),
      ...(categoryId ? { categoryId: Number(categoryId) } : {}),
    }),
    [q, lang, type, categoryId],
  );
  const hasFilters = Object.keys(filter).length > 0;

  // Marks still in the queue would be missing from the list: send them first.
  useEffect(() => {
    void queue?.flush({ all: true });
  }, [queue]);

  const list = useInfiniteQuery({
    queryKey: ['known', filter, sort],
    queryFn: ({ pageParam }) =>
      api.knownList({ ...filter, sort, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;
  const selectedVisible = items.filter((i) => selected.has(i.itemId)).map((i) => i.itemId);

  const restore = useMutation({
    mutationFn: (body: RestoreKnownRequest) => api.restoreKnown(body),
    onSuccess: ({ restored }) => {
      toast.show({ message: strings.known.returned(restored) });
      setSelected(new Set());
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ['known'] });
      void queryClient.invalidateQueries({ queryKey: ['available'] });
    },
    onError: () => toast.show({ message: strings.known.returnFailed }),
  });

  const toggle = (itemId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const languageName = (code: string) =>
    meta.data?.languages.find((l) => l.code === code)?.name ?? code.toUpperCase();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">{strings.known.title}</h1>
        {list.data && total > 0 && (
          <p className="text-muted" aria-live="polite">
            {strings.known.count(total)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-border bg-surface p-4 md:grid-cols-6">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label htmlFor={ids.search} className="text-sm text-muted">
            {strings.known.search}
          </label>
          <input
            id={ids.search}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={strings.known.searchPlaceholder}
            maxLength={100}
            className={selectClass}
          />
        </div>
        <FilterSelect id={ids.lang} label={strings.known.language} value={lang} onChange={setLang}>
          <option value="">{strings.known.all}</option>
          {meta.data?.languages.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={ids.type} label={strings.known.type} value={type} onChange={setType}>
          <option value="">{strings.known.all}</option>
          <option value="word">{strings.types.word}</option>
          <option value="expr">{strings.types.expr}</option>
        </FilterSelect>
        <FilterSelect
          id={ids.category}
          label={strings.known.category}
          value={categoryId}
          onChange={setCategoryId}
        >
          <option value="">{strings.known.all}</option>
          {meta.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id={ids.sort}
          label={strings.known.sort}
          value={sort}
          onChange={(v) => setSort(v as KnownSort)}
        >
          <option value="newest">{strings.known.sortNewest}</option>
          <option value="oldest">{strings.known.sortOldest}</option>
          <option value="az">{strings.known.sortAz}</option>
        </FilterSelect>
      </div>

      {items.length > 0 && (
        <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 bg-bg/95 px-4 py-3 backdrop-blur">
          {selectedVisible.length > 0 ? (
            <>
              <Button3D
                disabled={restore.isPending}
                onClick={() => restore.mutate({ itemIds: selectedVisible })}
              >
                {strings.known.returnSelected(selectedVisible.length)}
              </Button3D>
              <button
                type="button"
                className="min-h-11 px-2 text-sm text-muted hover:text-text"
                onClick={() => setSelected(new Set())}
              >
                {strings.known.clearSelection}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="min-h-11 rounded-[10px] border border-border px-3 text-sm hover:border-accent"
              disabled={restore.isPending}
              onClick={() => setConfirming(true)}
            >
              {strings.known.returnAllFiltered(total)}
            </button>
          )}
        </div>
      )}

      {list.isPending ? (
        <p className="py-8 text-center text-muted">{strings.known.loading}</p>
      ) : list.isError ? (
        <div role="alert" className="py-8 text-center">
          <p className="text-dontknow">{strings.known.loadFailed}</p>
          <button type="button" className="mt-2 text-accent" onClick={() => void list.refetch()}>
            {strings.known.retry}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-[14px] border border-border bg-surface p-6 text-center">
          {hasFilters ? (
            <p className="text-muted">{strings.known.noMatches}</p>
          ) : (
            <>
              <p className="text-lg font-semibold">{strings.known.emptyTitle}</p>
              <p className="mx-auto mt-2 max-w-md text-muted">{strings.known.emptyBody}</p>
            </>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={strings.known.title}>
          {items.map((item) => (
            <KnownRow
              key={item.itemId}
              item={item}
              languageName={languageName}
              selected={selected.has(item.itemId)}
              onToggle={() => toggle(item.itemId)}
              onReturn={() => restore.mutate({ itemIds: [item.itemId] })}
              busy={restore.isPending}
            />
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="min-h-11 rounded-[10px] border border-border px-4 hover:border-accent"
            disabled={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {list.isFetchingNextPage ? strings.known.loading : strings.known.loadMore}
          </button>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={strings.known.confirmTitle(total)}
          body={strings.known.confirmBody}
          confirmLabel={strings.known.confirm}
          cancelLabel={strings.known.cancel}
          busy={restore.isPending}
          onConfirm={() => restore.mutate({ filter })}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        {children}
      </select>
    </div>
  );
}

function answerText(item: KnownItem): string {
  const { lines, numbered } = item.answer;
  if (lines.length === 0) return strings.known.noAnswer;
  return numbered ? lines.map((l, i) => `${i + 1}. ${l}`).join('; ') : lines.join(', ');
}

function KnownRow({
  item,
  languageName,
  selected,
  onToggle,
  onReturn,
  busy,
}: {
  item: KnownItem;
  languageName: (code: string) => string;
  selected: boolean;
  onToggle: () => void;
  onReturn: () => void;
  busy: boolean;
}) {
  const checkboxId = useId();
  const date = new Date(item.knownAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-[14px] border border-border bg-surface p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <input
        id={checkboxId}
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={strings.known.selectRow(item.text)}
        className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <bdi dir={item.dir} lang={item.lang} className="text-lg font-semibold break-words">
            {item.text}
          </bdi>
          {item.multipleMeanings && (
            <span className="text-sm text-accent" title={strings.known.multipleMeanings}>
              <span aria-hidden="true">◆</span>
              <span className="sr-only">{strings.known.multipleMeanings}</span>
            </span>
          )}
          <span className="text-xs text-muted">
            {languageName(item.lang)} · {strings.types[item.type]}
          </span>
        </div>
        <p className="mt-1 text-sm">
          <span className="text-muted">
            {item.lang.toUpperCase()} → {item.knownTarget.toUpperCase()}:{' '}
          </span>
          <bdi dir={item.answer.dir} lang={item.answer.lang}>
            {answerText(item)}
          </bdi>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {item.categories.map((c) => (
            <span key={c.id} className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">
              {c.name}
            </span>
          ))}
          <span className="text-muted">{strings.known.knownOn(date)}</span>
          <span
            className={`rounded-full border px-2 py-0.5 ${item.knownInCycle === 1 ? 'border-know text-know' : 'border-accent text-accent'}`}
          >
            {item.knownInCycle === 1 ? strings.known.alreadyKnew : strings.known.learnedHere}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onReturn}
        disabled={busy}
        className="col-start-2 min-h-11 justify-self-start rounded-[10px] border border-border px-3 text-sm hover:border-accent sm:col-start-3 sm:row-start-1"
      >
        {strings.known.returnOne}
      </button>
    </li>
  );
}
