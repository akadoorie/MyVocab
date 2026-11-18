import type { AdminCategory, AdminItem, AdminItemPatch, AdminLanguage } from '@myvocab/contracts';
import { ITEM_LIMITS, type CardView } from '@myvocab/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { strings } from '../../strings';
import { adminStrings as s } from '../../strings-admin';
import { FlipCard } from '../loop/FlipCard';
import { adminApi, errorMessage, fieldErrors } from './admin-api';
import { ListEditor } from './ListEditor';
import { ErrorState, inputClass, Loading, PageTitle } from './ui';

type Header = {
  text: string;
  type: 'word' | 'expr';
  multipleMeanings: boolean;
  status: 'draft' | 'published';
  categoryIds: number[];
};

function useCatalog() {
  const languages = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  const categories = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  return {
    languages: languages.data?.languages ?? [],
    categories: categories.data?.categories ?? [],
    ready: languages.isSuccess && categories.isSuccess,
  };
}

/** Text, type, multiple meanings, status and categories (shared by "new" and "edit"). */
function HeaderFields({
  value,
  onChange,
  categories,
  errors,
}: {
  value: Header;
  onChange: (next: Header) => void;
  categories: AdminCategory[];
  errors: Record<string, string>;
}) {
  const ids = { text: useId(), type: useId(), status: useId(), mm: useId() };
  const set = <K extends keyof Header>(key: K, v: Header[K]) => onChange({ ...value, [key]: v });
  return (
    <>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <label htmlFor={ids.text} className="text-sm text-muted">
          {s.editor.text}
        </label>
        <input
          id={ids.text}
          value={value.text}
          maxLength={ITEM_LIMITS.textMax}
          onChange={(e) => set('text', e.target.value)}
          className={inputClass}
          aria-invalid={errors.text ? true : undefined}
        />
        {errors.text && <p className="text-sm text-dontknow">{errors.text}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.type} className="text-sm text-muted">
          {s.editor.type}
        </label>
        <select
          id={ids.type}
          value={value.type}
          onChange={(e) => set('type', e.target.value as Header['type'])}
          className={inputClass}
        >
          <option value="word">{strings.types.word}</option>
          <option value="expr">{strings.types.expr}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.status} className="text-sm text-muted">
          {s.editor.status}
        </label>
        <select
          id={ids.status}
          value={value.status}
          onChange={(e) => set('status', e.target.value as Header['status'])}
          className={inputClass}
        >
          <option value="published">{s.items.published}</option>
          <option value="draft">{s.items.draft}</option>
        </select>
      </div>
      <label htmlFor={ids.mm} className="flex min-h-11 items-center gap-3 md:col-span-2">
        <input
          id={ids.mm}
          type="checkbox"
          checked={value.multipleMeanings}
          onChange={(e) => set('multipleMeanings', e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        <span>◆ {s.editor.multipleMeanings}</span>
      </label>
      <fieldset className="md:col-span-2">
        <legend className="mb-2 text-sm text-muted">{s.editor.categories}</legend>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => {
            const on = value.categoryIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set(
                    'categoryIds',
                    on
                      ? value.categoryIds.filter((id) => id !== c.id)
                      : [...value.categoryIds, c.id].sort((a, b) => a - b),
                  )
                }
                className={`min-h-10 rounded-full border px-3 text-sm ${on ? 'border-accent bg-accent-strong text-[var(--on-color)]' : 'border-border text-muted hover:text-text'} ${c.isActive ? '' : 'opacity-60'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}

/** `/admin/items/new`: the header only; lists are edited once the item exists. */
export function NewItemPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { languages, categories, ready } = useCatalog();
  const active = languages.filter((l) => l.isActive);
  const langId = useId();
  const [lang, setLang] = useState('');
  const [header, setHeader] = useState<Header>({
    text: '',
    type: 'word',
    multipleMeanings: false,
    status: 'published',
    categoryIds: [],
  });
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const chosenLang = lang || active[0]?.code || '';

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const item = await adminApi.createItem({ lang: chosenLang, ...header });
      queryClient.setQueryData(['admin', 'item', item.itemId], item);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
      toast.show({ message: s.editor.created });
      navigate(`/admin/items/${item.itemId}`, { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <Loading />;
  const duplicateId =
    error instanceof ApiError
      ? (error.details as { itemId?: number } | undefined)?.itemId
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin/items" className="text-sm text-accent">
        ← {s.editor.back}
      </Link>
      <PageTitle>{s.editor.newTitle}</PageTitle>
      <div className="grid gap-4 rounded-[14px] border border-border bg-surface p-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label htmlFor={langId} className="text-sm text-muted">
            {s.editor.language}
          </label>
          <select
            id={langId}
            value={chosenLang}
            onChange={(e) => setLang(e.target.value)}
            className={inputClass}
          >
            {active.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">{s.editor.languageFixed}</p>
        </div>
        <HeaderFields
          value={header}
          onChange={setHeader}
          categories={categories}
          errors={fieldErrors(error)}
        />
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-dontknow">
          {errorMessage(error, s.common.genericError)}{' '}
          {duplicateId && (
            <Link to={`/admin/items/${duplicateId}`} className="text-accent underline">
              {s.common.edit}
            </Link>
          )}
        </p>
      )}
      <div>
        <Button3D disabled={busy || !header.text.trim()} onClick={() => void create()}>
          {busy ? s.editor.creating : s.editor.create}
        </Button3D>
      </div>
    </div>
  );
}

/** `/admin/items/:id`: the full editor (FR-A11/12). */
export function ItemEditorPage() {
  const id = Number(useParams().id);
  const itemQuery = useQuery({
    queryKey: ['admin', 'item', id],
    queryFn: () => adminApi.item(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const catalog = useCatalog();
  if (itemQuery.isError) {
    const notFound = itemQuery.error instanceof ApiError && itemQuery.error.status === 404;
    return notFound ? (
      <div className="flex flex-col gap-3">
        <p>{s.editor.notFound}</p>
        <Link to="/admin/items" className="text-accent">
          ← {s.editor.back}
        </Link>
      </div>
    ) : (
      <ErrorState onRetry={() => void itemQuery.refetch()} />
    );
  }
  if (!itemQuery.data || !catalog.ready) return <Loading />;
  return (
    <Editor
      key={itemQuery.data.itemId}
      item={itemQuery.data}
      languages={catalog.languages}
      categories={catalog.categories}
    />
  );
}

function headerOf(item: AdminItem): Header {
  return {
    text: item.text,
    type: item.type,
    multipleMeanings: item.multipleMeanings,
    status: item.status,
    categoryIds: item.categoryIds,
  };
}

function Editor({
  item,
  languages,
  categories,
}: {
  item: AdminItem;
  languages: AdminLanguage[];
  categories: AdminCategory[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const key = ['admin', 'item', item.itemId];
  const latest = useRef(item);
  useEffect(() => {
    latest.current = item;
  }, [item]);
  // Saves run one after another, each with the newest version (lists can be edited quickly).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [header, setHeader] = useState<Header>(() => headerOf(item));
  const [savingHeader, setSavingHeader] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const itemLang = languages.find((l) => l.code === item.lang);
  const itemDir = itemLang?.dir ?? 'ltr';
  const targets = languages.filter((l) => l.isActive && l.code !== item.lang);

  function save(patch: Omit<AdminItemPatch, 'version'>): Promise<boolean> {
    const run = queue.current.then(async () => {
      try {
        const updated = await adminApi.patchItem(item.itemId, {
          version: latest.current.version,
          ...patch,
        });
        latest.current = updated;
        queryClient.setQueryData(key, updated);
        void queryClient.invalidateQueries({ queryKey: ['admin', 'items'] });
        return true;
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.code === 'CONFLICT' &&
          (e.details as { reason?: string })?.reason === 'stale'
        ) {
          toast.show({ message: s.editor.conflict });
          const fresh = await adminApi.item(item.itemId).catch(() => null);
          if (fresh) {
            latest.current = fresh;
            queryClient.setQueryData(key, fresh);
            setHeader(headerOf(fresh));
          }
        } else {
          toast.show({ message: errorMessage(e, s.common.genericError) });
        }
        return false;
      }
    });
    queue.current = run;
    return run;
  }

  const headerDirty = JSON.stringify(header) !== JSON.stringify(headerOf(item));

  async function saveHeader() {
    setSavingHeader(true);
    const base = headerOf(latest.current);
    const patch: Omit<AdminItemPatch, 'version'> = {};
    for (const k of Object.keys(header) as (keyof Header)[]) {
      if (JSON.stringify(header[k]) !== JSON.stringify(base[k]))
        Object.assign(patch, { [k]: header[k] });
    }
    const ok = await save(patch);
    setSavingHeader(false);
    if (ok) toast.show({ message: s.editor.headerSaved });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/items" className="text-sm text-accent">
        ← {s.editor.back}
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <PageTitle>
          <bdi lang={item.lang} dir={itemDir}>
            {item.text}
          </bdi>
        </PageTitle>
        <span className="text-sm text-muted">{s.editor.version(item.version)}</span>
      </div>

      <section className="grid gap-4 rounded-[14px] border border-border bg-surface p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <p className="text-sm text-muted">{s.editor.language}</p>
          <p className="font-medium">{itemLang?.name ?? item.lang}</p>
          <p className="text-xs text-muted">{s.editor.languageFixed}</p>
        </div>
        <HeaderFields value={header} onChange={setHeader} categories={categories} errors={{}} />
        <div className="md:col-span-2">
          <Button3D disabled={!headerDirty || savingHeader} onClick={() => void saveHeader()}>
            {savingHeader ? s.common.saving : s.editor.saveHeader}
          </Button3D>
        </div>
      </section>

      <section
        aria-label={s.editor.warnings}
        className="rounded-[14px] border border-border bg-surface p-5"
      >
        <h2 className="mb-2 text-lg font-semibold">{s.editor.warnings}</h2>
        {item.warnings.length === 0 ? (
          <p className="text-sm text-muted">{s.editor.noWarnings}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {item.warnings.map((w, i) => (
              <li
                key={`${w.path}-${w.code}-${i}`}
                className="rounded-full border border-hint px-3 py-1 text-sm text-hint"
              >
                {w.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {targets.map((target) => (
          <div key={target.code} className="rounded-[14px] border border-border bg-surface p-5">
            <ListEditor
              label={s.editor.translationInto(target.name)}
              entries={item.translation[target.code] ?? []}
              lang={target.code}
              dir={target.dir}
              maxEntries={ITEM_LIMITS.translation.maxEntries}
              maxLength={ITEM_LIMITS.translation.entryMax}
              onSave={(next) => {
                const translation = { ...latest.current.translation };
                if (next.length > 0) translation[target.code] = next;
                else delete translation[target.code];
                return save({ translation });
              }}
            />
            <div className="mt-5 border-t border-border pt-5">
              <ListEditor
                label={s.editor.literalIn(target.name)}
                help={s.editor.literalHelp}
                entries={item.literal[target.code] ?? []}
                lang={target.code}
                dir={target.dir}
                maxEntries={ITEM_LIMITS.literal.maxEntries}
                maxLength={ITEM_LIMITS.literal.entryMax}
                onSave={(next) => {
                  const literal = { ...latest.current.literal };
                  if (next.length > 0) literal[target.code] = next;
                  else delete literal[target.code];
                  return save({ literal });
                }}
              />
            </div>
          </div>
        ))}
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <ListEditor
            label={s.editor.explanation}
            help={s.editor.explanationHelp}
            entries={item.explanation}
            lang={item.lang}
            dir={itemDir}
            numbered
            maxEntries={ITEM_LIMITS.explanation.maxEntries}
            maxLength={ITEM_LIMITS.explanation.entryMax}
            onSave={(explanation) => save({ explanation })}
          />
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <ListEditor
            label={s.editor.synonyms}
            entries={item.synonyms}
            lang={item.lang}
            dir={itemDir}
            maxEntries={ITEM_LIMITS.synonyms.maxEntries}
            maxLength={ITEM_LIMITS.synonyms.entryMax}
            onSave={(synonyms) => save({ synonyms })}
          />
        </div>
        <div className="rounded-[14px] border border-border bg-surface p-5">
          <ListEditor
            label={s.editor.hints}
            entries={item.hints}
            lang={item.lang}
            dir={itemDir}
            maxEntries={ITEM_LIMITS.hints.maxEntries}
            maxLength={ITEM_LIMITS.hints.entryMax}
            onSave={(hints) => save({ hints })}
          />
        </div>
      </div>

      <Preview itemId={item.itemId} version={item.version} />

      <div className="border-t border-border pt-6">
        <Button3D variant="dontknow" onClick={() => setConfirmDelete(true)}>
          {s.editor.deleteItem}
        </Button3D>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={s.editor.deleteTitle(item.text)}
          body={s.editor.deleteBody}
          confirmLabel={s.editor.deleteItem}
          cancelLabel={s.common.cancel}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            adminApi
              .deleteItem(item.itemId)
              .then(() => {
                void queryClient.invalidateQueries({ queryKey: ['admin'] });
                toast.show({ message: s.editor.deleted });
                navigate('/admin/items');
              })
              .catch((e: unknown) => {
                setConfirmDelete(false);
                toast.show({ message: errorMessage(e, s.common.genericError) });
              });
          }}
        />
      )}
    </div>
  );
}

/** "Preview as learner": the real flip card for every playable direction (FR-A11). */
function Preview({ itemId, version }: { itemId: number; version: number }) {
  const preview = useQuery({
    queryKey: ['admin', 'preview', itemId, version],
    queryFn: () => adminApi.preview(itemId),
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{s.editor.preview}</h2>
      {preview.data?.length === 0 && <p className="text-sm text-muted">{s.editor.previewNone}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        {preview.data?.map((card) => (
          <PreviewCard key={`${card.direction.source}-${card.direction.target}`} card={card} />
        ))}
      </div>
    </section>
  );
}

function PreviewCard({ card }: { card: CardView }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [hintsShown, setHintsShown] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <FlipCard
        card={card}
        side={side}
        hintsShown={hintsShown}
        onFlip={() => setSide((v) => (v === 'front' ? 'back' : 'front'))}
      />
      <div className="flex gap-3">
        <Button3D
          variant="hint"
          disabled={side !== 'front' || hintsShown}
          onClick={() => setHintsShown(true)}
        >
          {strings.loop.hints}
        </Button3D>
      </div>
    </div>
  );
}
