import type { AdminCategory, AdminItem, AdminItemPatch, AdminLanguage } from '@myvocab/contracts';
import {
  isLiteralSameAsParallel,
  ITEM_LIMITS,
  LITERAL_SAME_AS_PARALLEL,
  TRANSLATION_KINDS,
  type CardView,
} from '@myvocab/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { strings } from '../../strings';
import { adminStrings as s } from '../../strings-admin';
import { BulbIcon } from '../../components/Icons';
import { LoopButton } from '../loop/ButtonBar';
import { FlipCard } from '../loop/FlipCard';
import { adminApi, errorMessage, fieldErrors } from './admin-api';
import { ListEditor } from './ListEditor';
import { ErrorState, inputClass, Loading, PageTitle } from './ui';

type Header = {
  text: string;
  type: 'word' | 'expr';
  multipleMeanings: boolean;
  status: 'draft' | 'published';
  inSampleSet: boolean;
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
  const ids = { text: useId(), type: useId(), status: useId(), mm: useId(), sample: useId() };
  const set = <K extends keyof Header>(key: K, v: Header[K]) => onChange({ ...value, [key]: v });
  return (
    <>
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <label htmlFor={ids.text} className="text-sm text-muted">
          {s.editor.text}
        </label>
        <input
          autoComplete="off"
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
      <label htmlFor={ids.sample} className="flex min-h-11 items-center gap-3 md:col-span-2">
        <input
          id={ids.sample}
          type="checkbox"
          checked={value.inSampleSet}
          onChange={(e) => set('inSampleSet', e.target.checked)}
          className="h-5 w-5 accent-[var(--accent)]"
          aria-describedby={`${ids.sample}-help`}
        />
        <span>
          {s.editor.inSampleSet}
          <span id={`${ids.sample}-help`} className="block text-xs text-muted">
            {s.editor.inSampleSetHelp}
          </span>
        </span>
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
  const langNoteId = useId();
  const [lang, setLang] = useState('');
  const [header, setHeader] = useState<Header>({
    text: '',
    type: 'word',
    multipleMeanings: false,
    status: 'published',
    // New items start outside the sample set (D-038).
    inSampleSet: false,
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
            aria-describedby={langNoteId}
          >
            {/* Inactive languages too, so their items can be prepared (D-027). */}
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.isActive ? l.name : s.editor.inactiveOption(l.name)}
              </option>
            ))}
          </select>
          <p id={langNoteId} className="text-xs text-muted">
            {languages.find((l) => l.code === chosenLang)?.isActive === false
              ? s.editor.inactiveLanguageNote(
                  languages.find((l) => l.code === chosenLang)?.name ?? chosenLang,
                )
              : s.editor.languageFixed}
          </p>
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
    inSampleSet: item.inSampleSet,
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
  // Every other language, inactive ones too (marked), so their content can be prepared (D-027).
  const targets = languages.filter((l) => l.code !== item.lang);

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

  /**
   * The literal's "Same as the parallel" checkbox (D-026), offered when the language has a
   * parallel and no literal entries of its own. Ticked, it stores the marker instead of a list.
   */
  async function toggleLiteralSame(code: string, same: boolean) {
    const lists = { ...latest.current.literal };
    if (same) lists[code] = [LITERAL_SAME_AS_PARALLEL];
    else delete lists[code];
    await save({ literal: lists });
  }

  function literalSameProps(target: { code: string; name: string }) {
    const literal = item.literal[target.code] ?? [];
    const same = isLiteralSameAsParallel(literal);
    const hasParallel = (item.parallel[target.code]?.length ?? 0) > 0;
    if (!same && (!hasParallel || literal.length > 0)) return {};
    return {
      control: (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={same}
            onChange={(e) => void toggleLiteralSame(target.code, e.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          {s.editor.literalSameAsParallel}
        </label>
      ),
      replacement: same ? (
        <p className="text-sm text-muted">{s.editor.literalSameAsParallelNote}</p>
      ) : undefined,
    };
  }

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
          {itemLang && !itemLang.isActive && (
            <p className="mt-1 text-xs text-hint">{s.editor.inactiveLanguageNote(itemLang.name)}</p>
          )}
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

      {/* One list under the other, full width, so long entries have room to be read and edited. */}
      <div className="flex flex-col gap-6">
        {targets.map((target) => (
          <div key={target.code} className="rounded-[14px] border border-border bg-surface p-5">
            {!target.isActive && (
              <p className="mb-4 rounded-[10px] border border-hint px-3 py-2 text-sm text-hint">
                {s.editor.inactiveLanguageNote(target.name)}
              </p>
            )}
            {/* The three kinds of translation (PRD §8.1, D-024): parallel, meaning, literal. */}
            {TRANSLATION_KINDS.map((kind, i) => (
              <div key={kind} className={i > 0 ? 'mt-5 border-t border-border pt-5' : ''}>
                <ListEditor
                  label={s.editor.kinds[kind].label(target.name)}
                  help={s.editor.kinds[kind].help}
                  {...(kind === 'literal' ? literalSameProps(target) : {})}
                  entries={item[kind][target.code] ?? []}
                  lang={target.code}
                  dir={target.dir}
                  maxEntries={ITEM_LIMITS[kind].maxEntries}
                  maxLength={ITEM_LIMITS[kind].entryMax}
                  onSave={(next) => {
                    const lists = { ...latest.current[kind] };
                    if (next.length > 0) lists[target.code] = next;
                    else delete lists[target.code];
                    return save({ [kind]: lists });
                  }}
                />
              </div>
            ))}
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

      <Preview item={item} languages={languages} />

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

/** Above this many answer languages, the picker is a dropdown instead of buttons. */
const PICKER_BUTTONS_MAX = 6;

/**
 * "Preview as learner" (FR-A11): one card at a time, from the same builder as a session. A picker
 * chooses the answer language: the other languages first (translation cards), then the item's own
 * language (explanation card). Each choice is marked ready or not, and one that isn't ready says
 * what to add. It opens on the first ready translation language (Hebrew item → English, English
 * item → Hebrew), active languages before inactive ones. Inactive languages are listed and marked,
 * so their cards can be checked before learners see them (D-027).
 */
function Preview({ item, languages }: { item: AdminItem; languages: AdminLanguage[] }) {
  const preview = useQuery({
    queryKey: ['admin', 'preview', item.itemId, item.version],
    queryFn: () => adminApi.preview(item.itemId),
  });
  const pickerId = useId();
  const own = languages.find((l) => l.code === item.lang);
  const options = [...languages.filter((l) => l.code !== item.lang), ...(own ? [own] : [])];
  const ready = (code: string) => item.playableTargets.includes(code);
  const translations = options.filter((l) => l.code !== item.lang && ready(l.code));
  const fallback = translations.find((l) => l.isActive) ?? translations[0] ?? options[0];
  const [chosen, setChosen] = useState<string | null>(null);
  const target = options.find((l) => l.code === chosen) ?? fallback;
  if (!target) return null;

  const sourceName = own?.name ?? item.lang;
  const isExplanation = target.code === item.lang;
  const card = preview.data?.find((c) => c.direction.target === target.code);
  const mark = (code: string) => (ready(code) ? '✓' : '✗');
  const status = (l: AdminLanguage) => {
    const parts: string[] = [ready(l.code) ? s.editor.previewReady : s.editor.previewNotReady];
    if (!l.isActive) parts.push(s.editor.previewInactive);
    return parts.join(', ');
  };
  const label = (l: AdminLanguage) =>
    l.isActive ? l.name : `${l.name} (${s.editor.previewInactive})`;

  return (
    <section aria-label={s.editor.preview} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{s.editor.preview}</h2>
        <p className="text-sm text-muted">{s.editor.previewIntro}</p>
      </div>

      {options.length > PICKER_BUTTONS_MAX ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={pickerId} className="text-sm text-muted">
            {s.editor.previewAnswerIn}
          </label>
          <select
            id={pickerId}
            value={target.code}
            onChange={(e) => setChosen(e.target.value)}
            className={inputClass}
          >
            {options.map((l) => (
              <option key={l.code} value={l.code}>
                {`${label(l)} ${mark(l.code)}`}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div role="group" aria-label={s.editor.previewAnswerIn} className="flex flex-col gap-2">
          <p aria-hidden="true" className="text-sm text-muted">
            {s.editor.previewAnswerIn}
          </p>
          <div className="flex flex-wrap gap-2">
            {options.map((l) => {
              const on = l.code === target.code;
              return (
                <button
                  key={l.code}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${l.name}, ${status(l)}`}
                  onClick={() => setChosen(l.code)}
                  className={`min-h-10 rounded-full border px-3 text-sm ${on ? 'border-accent bg-accent-strong text-[var(--on-color)]' : 'border-border text-muted hover:text-text'} ${l.isActive ? '' : 'border-dashed'}`}
                >
                  {label(l)}{' '}
                  <span
                    aria-hidden="true"
                    className={on ? '' : ready(l.code) ? 'text-know' : 'text-dontknow'}
                  >
                    {mark(l.code)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">
          {sourceName} → {target.name} ·{' '}
          {isExplanation ? s.editor.previewExplanation : s.editor.previewTranslation}
        </h3>
        <p className="text-sm text-muted">
          {ready(target.code)
            ? isExplanation
              ? s.editor.previewBackExplanation(target.name)
              : s.editor.previewBackTranslation(target.name)
            : isExplanation
              ? s.editor.previewMissingExplanation
              : s.editor.previewMissingMeaning(target.name)}
        </p>
        {!target.isActive && (
          <p className="text-sm text-hint">{s.editor.previewInactiveNote(target.name)}</p>
        )}
      </div>
      {ready(target.code) && card && <PreviewCard key={target.code} card={card} />}
    </section>
  );
}

/**
 * The session card's size at this window (LoopPage, desktop): the page is at most 1100px wide with
 * 32px side padding, and the card is clamp(420px, 58vh, 600px) tall. The preview draws the card at
 * exactly that size and scales it down to its column, so it is a true miniature of the session card.
 * Null on phones (and where it can't be measured), where the card simply fills the column.
 */
function useSessionCardFit(ref: RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<{ width: number; height: number; scale: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const mq = window.matchMedia?.('(min-width: 768px)');
    if (!el || !mq || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      if (!mq.matches) return setFit(null);
      const width = Math.min(1100, document.documentElement.clientWidth) - 64;
      const height = Math.min(600, Math.max(420, window.innerHeight * 0.58));
      setFit({ width, height, scale: Math.min(1, el.clientWidth / width) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    mq.addEventListener('change', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      mq.removeEventListener('change', update);
    };
  }, [ref]);
  return fit;
}

function PreviewCard({ card }: { card: CardView }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [hintsShown, setHintsShown] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const fit = useSessionCardFit(frame);
  return (
    <div className="flex w-full flex-col gap-5">
      <div
        ref={frame}
        className={fit ? 'relative w-full' : 'flex h-[min(68dvh,560px)] w-full flex-col'}
        style={fit ? { height: fit.height * fit.scale } : undefined}
      >
        <div
          className={fit ? 'absolute top-0 left-0 flex origin-top-left flex-col' : 'contents'}
          style={
            fit
              ? { width: fit.width, height: fit.height, transform: `scale(${fit.scale})` }
              : undefined
          }
        >
          <FlipCard
            card={card}
            side={side}
            hintsShown={hintsShown}
            onFlip={() => setSide((v) => (v === 'front' ? 'back' : 'front'))}
          />
        </div>
      </div>
      {/* The session's Hints toggle (FR-L24); Know / Don't know have no meaning in a preview. */}
      <LoopButton
        kind="hint"
        className="self-start"
        icon={<BulbIcon />}
        label={strings.loop.hints}
        pressed={hintsShown && side === 'front'}
        disabled={side !== 'front'}
        onClick={() => setHintsShown((v) => !v)}
      />
    </div>
  );
}
