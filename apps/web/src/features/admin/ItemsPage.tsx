import type { AdminItemListQuery } from '@myvocab/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { strings } from '../../strings';
import { adminStrings as s } from '../../strings-admin';
import { useDebounced } from '../setup/useDebounced';
import { adminApi } from './admin-api';
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

type Gap =
  '' | 'missingExplanation' | 'noHints' | 'notPlayable' | 'multipleMeanings' | `missing:${string}`;

/** `/admin/items` (FR-A10): search, filters, sort, 50 per page. */
export function ItemsPage() {
  const ids = {
    q: useId(),
    lang: useId(),
    type: useId(),
    cat: useId(),
    status: useId(),
    sample: useId(),
    gap: useId(),
    sort: useId(),
  };
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const [lang, setLang] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [sample, setSample] = useState<'' | 'true' | 'false'>('');
  const [gap, setGap] = useState<Gap>('');
  const [sort, setSort] = useState<'updated' | 'text' | 'created'>('updated');
  const [page, setPage] = useState(1);

  const languages = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  // Every language, inactive ones too: "Missing Arabic meaning" helps prepare a new one (D-027).
  const allLangs = languages.data?.languages ?? [];

  const params: AdminItemListQuery = {
    sort,
    page,
    ...(q ? { q } : {}),
    ...(lang ? { lang } : {}),
    ...(type === 'word' || type === 'expr' ? { type } : {}),
    ...(categoryId ? { categoryId: Number(categoryId) } : {}),
    ...(status === 'draft' || status === 'published' ? { status } : {}),
    ...(sample ? { inSampleSet: sample } : {}),
    ...(gap.startsWith('missing:') ? { missingTranslation: gap.slice(8) } : {}),
    ...(gap === 'missingExplanation' ? { missingExplanation: 'true' as const } : {}),
    ...(gap === 'noHints' ? { noHints: 'true' as const } : {}),
    ...(gap === 'notPlayable' ? { notPlayable: 'true' as const } : {}),
    ...(gap === 'multipleMeanings' ? { multipleMeanings: 'true' as const } : {}),
  };
  const list = useQuery({
    queryKey: ['admin', 'items', params],
    queryFn: () => adminApi.items(params),
    placeholderData: keepPreviousData,
  });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;
  const filter =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };
  const langName = (code: string) =>
    languages.data?.languages.find((l) => l.code === code)?.name ?? code.toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>{s.items.title}</PageTitle>
        <Link to="/admin/items/new" className={`${ghostButton} flex items-center`}>
          + {s.items.newItem}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-[14px] border border-border bg-surface p-4 lg:grid-cols-4">
        <Field id={ids.q} label={s.common.search} className="col-span-2">
          <input
            autoComplete="off"
            id={ids.q}
            type="search"
            value={search}
            maxLength={100}
            placeholder={s.items.searchPlaceholder}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          />
        </Field>
        <Field id={ids.lang} label={s.items.language}>
          <select
            id={ids.lang}
            value={lang}
            onChange={(e) => filter(setLang)(e.target.value)}
            className={inputClass}
          >
            <option value="">{s.common.all}</option>
            {languages.data?.languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={ids.type} label={s.items.type}>
          <select
            id={ids.type}
            value={type}
            onChange={(e) => filter(setType)(e.target.value)}
            className={inputClass}
          >
            <option value="">{s.common.all}</option>
            <option value="word">{strings.types.word}</option>
            <option value="expr">{strings.types.expr}</option>
          </select>
        </Field>
        <Field id={ids.cat} label={s.items.category}>
          <select
            id={ids.cat}
            value={categoryId}
            onChange={(e) => filter(setCategoryId)(e.target.value)}
            className={inputClass}
          >
            <option value="">{s.common.all}</option>
            {categories.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id={ids.status} label={s.items.status}>
          <select
            id={ids.status}
            value={status}
            onChange={(e) => filter(setStatus)(e.target.value)}
            className={inputClass}
          >
            <option value="">{s.common.all}</option>
            <option value="published">{s.items.published}</option>
            <option value="draft">{s.items.draft}</option>
          </select>
        </Field>
        <Field id={ids.sample} label={s.items.sampleSet}>
          <select
            id={ids.sample}
            value={sample}
            onChange={(e) => filter(setSample)(e.target.value as typeof sample)}
            className={inputClass}
          >
            <option value="">{s.common.all}</option>
            <option value="true">{s.items.inSampleSet}</option>
            <option value="false">{s.items.notInSampleSet}</option>
          </select>
        </Field>
        <Field id={ids.gap} label={s.items.gaps}>
          <select
            id={ids.gap}
            value={gap}
            onChange={(e) => filter(setGap)(e.target.value as Gap)}
            className={inputClass}
          >
            <option value="">{s.items.gapNone}</option>
            {allLangs.map((l) => (
              <option key={l.code} value={`missing:${l.code}`}>
                {s.items.gapMissing(l.name)}
              </option>
            ))}
            <option value="missingExplanation">{s.items.gapExplanation}</option>
            <option value="noHints">{s.items.gapHints}</option>
            <option value="notPlayable">{s.items.gapNotPlayable}</option>
            <option value="multipleMeanings">{s.items.gapMultiple}</option>
          </select>
        </Field>
        <Field id={ids.sort} label={s.items.sort}>
          <select
            id={ids.sort}
            value={sort}
            onChange={(e) => filter(setSort)(e.target.value as typeof sort)}
            className={inputClass}
          >
            <option value="updated">{s.items.sortUpdated}</option>
            <option value="text">{s.items.sortText}</option>
            <option value="created">{s.items.sortCreated}</option>
          </select>
        </Field>
      </div>

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.items.empty}</p>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {s.items.count(list.data.total)}
          </p>
          <ul className="flex flex-col gap-2" aria-label={s.items.title}>
            {list.data.items.map((item) => (
              <li key={item.itemId}>
                <Link
                  to={`/admin/items/${item.itemId}`}
                  className="flex flex-col gap-2 rounded-[14px] border border-border bg-surface p-4 hover:border-accent md:flex-row md:items-center md:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-2">
                      <bdi lang={item.lang} dir={item.dir} className="font-semibold break-words">
                        {item.text}
                      </bdi>
                      {item.multipleMeanings && (
                        <span className="text-accent" title={s.items.gapMultiple}>
                          ◆
                        </span>
                      )}
                      {item.inSampleSet && <Badge tone="hint">{s.items.sampleBadge}</Badge>}
                      <span className="text-xs text-muted">
                        {langName(item.lang)} · {strings.types[item.type]}
                      </span>
                    </p>
                    {item.categories.length > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        {item.categories.map((c) => c.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {allLangs
                      .filter((l) => l.code !== item.lang)
                      .map((l) => (
                        <Badge
                          key={l.code}
                          tone={item.translationCounts[l.code] ? 'know' : 'dontknow'}
                        >
                          {l.code.toUpperCase()} {item.translationCounts[l.code] ?? 0}
                        </Badge>
                      ))}
                    <Badge tone={item.explanationCount > 0 ? 'know' : 'dontknow'}>
                      {s.items.explanation} {item.explanationCount > 0 ? '✓' : '✕'}
                    </Badge>
                    <Badge>{s.items.hints(item.hintCount)}</Badge>
                    {item.status === 'draft' && <Badge tone="hint">{s.items.draft}</Badge>}
                    <span className="text-xs text-muted">{formatDate(item.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
              <button
                type="button"
                className={ghostButton}
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {s.common.previous}
              </button>
              <span className="text-sm text-muted">{s.common.page(page, pages)}</span>
              <button
                type="button"
                className={ghostButton}
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {s.common.next}
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
