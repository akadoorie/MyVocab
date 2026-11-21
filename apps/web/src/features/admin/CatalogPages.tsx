import {
  topicSlugSchema,
  langCodeSchema,
  type AdminTopic,
  type AdminLanguage,
  type LanguageCreate,
} from '@myvocab/contracts';
import { isSupportedScript } from '@myvocab/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage } from './admin-api';
import { LANGUAGE_PRESETS } from './language-presets';
import { Badge, ErrorState, Field, ghostButton, inputClass, Loading, PageTitle } from './ui';

/**
 * A slug suggestion from a topic name: "Home & Garden" → "home-garden". Accents are dropped;
 * letters outside a–z (e.g. Hebrew) give nothing, so the admin types the slug themselves.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
    .replace(/^-+|-+$/g, '');
}

/** `/admin/topics` (FR-A30). */
export function TopicsPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const ids = { slug: useId(), name: useId(), slugNote: useId() };
  const list = useQuery({ queryKey: ['admin', 'topics'], queryFn: adminApi.topics });
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  /** True while the slug follows the name; the admin typing in the slug field takes it over. */
  const [slugAuto, setSlugAuto] = useState(true);
  const [editing, setEditing] = useState<{ id: number; name: string; slug: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminTopic | null>(null);

  const done = (message: string) => {
    toast.show({ message });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'topics'] });
    void queryClient.invalidateQueries({ queryKey: ['meta'] });
  };
  const fail = (e: unknown) =>
    toast.show({ message: errorMessage(e, s.common.genericError), durationMs: 8000 });

  const create = useMutation({
    mutationFn: () => adminApi.createTopic({ slug: slug.trim(), name: name.trim() }),
    onSuccess: () => {
      setSlug('');
      setName('');
      setSlugAuto(true);
      done(s.topics.created);
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: (v: {
      id: number;
      body: { slug?: string; name?: string; isActive?: boolean; excludesTopicId?: number | null };
    }) => adminApi.patchTopic(v.id, v.body),
    onSuccess: () => {
      setEditing(null);
      done(s.topics.updated);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminApi.deleteTopic(id),
    onSuccess: () => {
      setDeleting(null);
      done(s.topics.deleted);
    },
    onError: (e) => {
      setDeleting(null);
      fail(e);
    },
  });
  const reorder = useMutation({
    mutationFn: (order: number[]) => adminApi.reorderTopics(order),
    onSuccess: () => done(s.topics.updated),
    onError: fail,
  });

  const topics = list.data?.topics ?? [];

  const slugValue = slug.trim();
  const takenBy = topics.find((c) => c.slug === slugValue);
  const slugError = !slugValue
    ? null
    : !topicSlugSchema.safeParse(slugValue).success
      ? s.topics.slugInvalid
      : takenBy
        ? s.topics.slugTaken(takenBy.name)
        : null;
  const slugNote = name.trim() && !slugValue ? s.topics.slugNeeded : s.topics.slugHelp;
  const canAdd = !!slugValue && !!name.trim() && !slugError && !create.isPending;

  const move = (index: number, delta: number) => {
    const order = topics.map((c) => c.id);
    const [id] = order.splice(index, 1);
    order.splice(index + delta, 0, id!);
    reorder.mutate(order);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.topics.title}</PageTitle>
      <form
        className="grid gap-3 rounded-[14px] border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_auto] md:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) create.mutate();
        }}
      >
        <Field id={ids.name} label={s.topics.name}>
          <input
            autoComplete="off"
            id={ids.name}
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
              if (slugAuto) setSlug(slugify(e.target.value));
            }}
            className={inputClass}
          />
        </Field>
        <Field id={ids.slug} label={s.topics.slug}>
          <input
            autoComplete="off"
            id={ids.slug}
            value={slug}
            maxLength={50}
            onChange={(e) => {
              const next = e.target.value.toLowerCase();
              setSlug(next);
              // Clearing the field hands it back to the Name; any other edit takes it over.
              setSlugAuto(next === '');
            }}
            className={inputClass}
            placeholder="home-garden"
            aria-invalid={slugError ? true : undefined}
            aria-describedby={ids.slugNote}
          />
          <p
            id={ids.slugNote}
            className={`text-sm ${slugError ? 'text-dontknow' : 'text-muted'}`}
            aria-live="polite"
          >
            {slugError ?? slugNote}
          </p>
        </Field>
        <button type="submit" className={`${ghostButton} md:mt-[1.625rem]`} disabled={!canAdd}>
          + {s.topics.add}
        </button>
      </form>

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : topics.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.topics.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.topics.title}>
          {topics.map((c, index) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-surface p-3"
            >
              {editing?.id === c.id ? (
                <form
                  className="flex flex-1 flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    update.mutate({
                      id: c.id,
                      body: { name: editing.name.trim(), slug: editing.slug.trim() },
                    });
                  }}
                >
                  <input
                    autoComplete="off"
                    aria-label={s.topics.name}
                    value={editing.name}
                    maxLength={60}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className={`${inputClass} md:w-56`}
                  />
                  <input
                    autoComplete="off"
                    aria-label={s.topics.slug}
                    value={editing.slug}
                    maxLength={50}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase() })}
                    className={`${inputClass} md:w-56`}
                  />
                  <button type="submit" className={ghostButton}>
                    {s.common.save}
                  </button>
                  <button type="button" className={ghostButton} onClick={() => setEditing(null)}>
                    {s.common.cancel}
                  </button>
                </form>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.slug} · {s.topics.items(c.itemCount)}
                  </p>
                </div>
              )}
              {/* "Can't be combined with" (D-046): set on either topic, applies both ways. */}
              <select
                aria-label={s.topics.excludesLabel(c.name)}
                value={c.excludesTopicId ?? ''}
                onChange={(e) =>
                  update.mutate({
                    id: c.id,
                    body: {
                      excludesTopicId: e.target.value === '' ? null : Number(e.target.value),
                    },
                  })
                }
                className={`${inputClass} md:w-64`}
              >
                <option value="">{s.topics.combinable}</option>
                {topics
                  .filter((other) => other.id !== c.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {s.topics.notWith(other.name)}
                    </option>
                  ))}
              </select>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.isActive}
                  aria-label={s.topics.activeLabel(c.name)}
                  onChange={(e) =>
                    update.mutate({ id: c.id, body: { isActive: e.target.checked } })
                  }
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                {c.isActive ? s.common.active : <Badge>{s.common.inactive}</Badge>}
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  className={ghostButton}
                  disabled={index === 0 || reorder.isPending}
                  aria-label={`${c.name} ↑`}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={ghostButton}
                  disabled={index === topics.length - 1 || reorder.isPending}
                  aria-label={`${c.name} ↓`}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={ghostButton}
                  onClick={() => setEditing({ id: c.id, name: c.name, slug: c.slug })}
                >
                  {s.common.edit}
                </button>
                <button
                  type="button"
                  className={`${ghostButton} text-dontknow`}
                  onClick={() => setDeleting(c)}
                >
                  {s.common.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {deleting && (
        <ConfirmDialog
          title={s.topics.deleteTitle(deleting.name)}
          body={s.topics.deleteBody}
          confirmLabel={s.common.delete}
          cancelLabel={s.common.cancel}
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** `/admin/languages` (FR-A35): activate, rename and add languages (D-027). */
export function LanguagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  const [editing, setEditing] = useState<{
    code: string;
    name: string;
    nativeName: string;
  } | null>(null);
  const applied = (data: { languages: AdminLanguage[] }) => {
    queryClient.setQueryData(['admin', 'languages'], data);
    void queryClient.invalidateQueries({ queryKey: ['meta'] });
  };
  const fail = (e: unknown) =>
    toast.show({ message: errorMessage(e, s.common.genericError), durationMs: 8000 });
  const toggle = useMutation({
    mutationFn: (v: { code: string; isActive: boolean }) =>
      adminApi.setLanguageActive(v.code, v.isActive),
    onSuccess: applied,
    onError: fail,
  });
  const rename = useMutation({
    mutationFn: (v: { code: string; name: string; nativeName: string }) =>
      adminApi.renameLanguage(v.code, { name: v.name, nativeName: v.nativeName }),
    onSuccess: (data) => {
      applied(data);
      setEditing(null);
      toast.show({ message: s.languages.renamed });
    },
    onError: fail,
  });
  const languages = list.data?.languages ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.languages.title}</PageTitle>
      <p className="text-sm text-muted">{s.languages.help}</p>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <>
          <ul className="flex flex-col gap-2" aria-label={s.languages.title}>
            {languages.map((l) => (
              <li
                key={l.code}
                className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-surface p-4"
              >
                {editing?.code === l.code ? (
                  <form
                    className="flex flex-1 flex-wrap gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      rename.mutate({
                        code: l.code,
                        name: editing.name.trim(),
                        nativeName: editing.nativeName.trim(),
                      });
                    }}
                  >
                    <input
                      autoComplete="off"
                      aria-label={s.languages.name}
                      value={editing.name}
                      maxLength={40}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      className={`${inputClass} md:w-56`}
                    />
                    <input
                      autoComplete="off"
                      aria-label={s.languages.nativeName}
                      lang={l.code}
                      dir={l.dir}
                      value={editing.nativeName}
                      maxLength={40}
                      onChange={(e) => setEditing({ ...editing, nativeName: e.target.value })}
                      className={`${inputClass} md:w-56`}
                    />
                    <button
                      type="submit"
                      className={ghostButton}
                      disabled={
                        !editing.name.trim() || !editing.nativeName.trim() || rename.isPending
                      }
                    >
                      {s.common.save}
                    </button>
                    <button type="button" className={ghostButton} onClick={() => setEditing(null)}>
                      {s.common.cancel}
                    </button>
                  </form>
                ) : (
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {l.name}{' '}
                      <span lang={l.code} dir={l.dir} className="text-muted">
                        ({l.nativeName})
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {l.code} · {s.languages.direction}: {l.dir.toUpperCase()} ·{' '}
                      {s.languages.script}: {l.script}
                    </p>
                  </div>
                )}
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={l.isActive}
                    aria-label={s.languages.activeLabel(l.name)}
                    disabled={toggle.isPending}
                    onChange={(e) => toggle.mutate({ code: l.code, isActive: e.target.checked })}
                    className="h-5 w-5 accent-[var(--accent)]"
                  />
                  {l.isActive ? s.common.active : <Badge>{s.common.inactive}</Badge>}
                </label>
                {editing?.code !== l.code && (
                  <button
                    type="button"
                    className={ghostButton}
                    aria-label={`${s.common.edit} ${l.name}`}
                    onClick={() =>
                      setEditing({ code: l.code, name: l.name, nativeName: l.nativeName })
                    }
                  >
                    {s.common.edit}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <AddLanguageForm languages={languages} onAdded={applied} onError={fail} />
        </>
      )}
    </div>
  );
}

const EMPTY_LANGUAGE: LanguageCreate = {
  code: '',
  name: '',
  nativeName: '',
  dir: 'ltr',
  script: '',
};

/**
 * "Add a language" (D-027): a preset fills the details (still editable); "Other" leaves them for
 * the admin to type. The language is created inactive.
 */
function AddLanguageForm({
  languages,
  onAdded,
  onError,
}: {
  languages: AdminLanguage[];
  onAdded: (data: { languages: AdminLanguage[] }) => void;
  onError: (e: unknown) => void;
}) {
  const toast = useToast();
  const ids = {
    preset: useId(),
    code: useId(),
    codeNote: useId(),
    name: useId(),
    nativeName: useId(),
    script: useId(),
    scriptNote: useId(),
  };
  const [preset, setPreset] = useState('');
  const [form, setForm] = useState<LanguageCreate>(EMPTY_LANGUAGE);
  const set = <K extends keyof LanguageCreate>(key: K, value: LanguageCreate[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const existing = new Set(languages.map((l) => l.code));
  const presets = LANGUAGE_PRESETS.filter((p) => !existing.has(p.code));

  const create = useMutation({
    mutationFn: (body: LanguageCreate) => adminApi.createLanguage(body),
    onSuccess: (data, body) => {
      onAdded(data);
      toast.show({ message: s.languages.added(body.name) });
      setPreset('');
      setForm(EMPTY_LANGUAGE);
    },
    onError,
  });

  const code = form.code.trim();
  const script = form.script.trim();
  const takenBy = languages.find((l) => l.code === code);
  const codeError = !code
    ? null
    : !langCodeSchema.safeParse(code).success
      ? s.languages.codeInvalid
      : takenBy
        ? s.languages.codeTaken(takenBy.name)
        : null;
  const scriptError = script && !isSupportedScript(script) ? s.languages.scriptInvalid : null;
  const body: LanguageCreate = {
    ...form,
    code,
    script,
    name: form.name.trim(),
    nativeName: form.nativeName.trim(),
  };
  const canAdd =
    !!code &&
    !!script &&
    !!body.name &&
    !!body.nativeName &&
    !codeError &&
    !scriptError &&
    !create.isPending;

  return (
    <section
      aria-labelledby={`${ids.preset}-title`}
      className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${ids.preset}-title`} className="text-lg font-semibold">
          {s.languages.addTitle}
        </h2>
        <p className="text-sm text-muted">{s.languages.addHelp}</p>
      </div>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) create.mutate(body);
        }}
      >
        <Field id={ids.preset} label={s.languages.preset} className="md:col-span-2">
          <select
            id={ids.preset}
            value={preset}
            onChange={(e) => {
              const next = e.target.value;
              setPreset(next);
              const chosen = presets.find((p) => p.code === next);
              setForm(chosen ?? EMPTY_LANGUAGE);
            }}
            className={inputClass}
          >
            <option value="">{s.languages.presetChoose}</option>
            {presets.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.nativeName})
              </option>
            ))}
            <option value="other">{s.languages.presetOther}</option>
          </select>
        </Field>
        {preset !== '' && (
          <>
            <Field id={ids.code} label={s.languages.code}>
              <input
                autoComplete="off"
                id={ids.code}
                value={form.code}
                maxLength={12}
                onChange={(e) => set('code', e.target.value.toLowerCase())}
                className={inputClass}
                placeholder="ar"
                aria-invalid={codeError ? true : undefined}
                aria-describedby={ids.codeNote}
              />
              <p
                id={ids.codeNote}
                className={`text-sm ${codeError ? 'text-dontknow' : 'text-muted'}`}
                aria-live="polite"
              >
                {codeError ?? s.languages.codeHelp}
              </p>
            </Field>
            <Field id={ids.script} label={s.languages.script}>
              <input
                autoComplete="off"
                id={ids.script}
                value={form.script}
                maxLength={4}
                onChange={(e) => set('script', e.target.value)}
                className={inputClass}
                placeholder="Arab"
                aria-invalid={scriptError ? true : undefined}
                aria-describedby={ids.scriptNote}
              />
              <p
                id={ids.scriptNote}
                className={`text-sm ${scriptError ? 'text-dontknow' : 'text-muted'}`}
                aria-live="polite"
              >
                {scriptError ?? s.languages.scriptHelp}
              </p>
            </Field>
            <Field id={ids.name} label={s.languages.name}>
              <input
                autoComplete="off"
                id={ids.name}
                value={form.name}
                maxLength={40}
                onChange={(e) => set('name', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field id={ids.nativeName} label={s.languages.nativeName}>
              <input
                autoComplete="off"
                id={ids.nativeName}
                value={form.nativeName}
                maxLength={40}
                lang={code || undefined}
                dir={form.dir}
                onChange={(e) => set('nativeName', e.target.value)}
                className={inputClass}
              />
            </Field>
            <fieldset className="md:col-span-2">
              <legend className="mb-2 text-sm text-muted">{s.languages.direction}</legend>
              <div className="flex flex-wrap gap-4">
                {(['rtl', 'ltr'] as const).map((dir) => (
                  <label key={dir} className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name={`${ids.preset}-dir`}
                      value={dir}
                      checked={form.dir === dir}
                      onChange={() => set('dir', dir)}
                      className="h-5 w-5 accent-[var(--accent)]"
                    />
                    {dir === 'rtl' ? s.languages.dirRtl : s.languages.dirLtr}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="md:col-span-2">
              <button type="submit" className={ghostButton} disabled={!canAdd}>
                + {create.isPending ? s.languages.adding : s.languages.add}
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
