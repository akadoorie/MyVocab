import { categorySlugSchema, type AdminCategory } from '@myvocab/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage } from './admin-api';
import { Badge, ErrorState, Field, ghostButton, inputClass, Loading, PageTitle } from './ui';

/**
 * A slug suggestion from a category name: "Home & Garden" → "home-garden". Accents are dropped;
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

/** `/admin/categories` (FR-A30). */
export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const ids = { slug: useId(), name: useId(), slugNote: useId() };
  const list = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  /** True while the slug follows the name; the admin typing in the slug field takes it over. */
  const [slugAuto, setSlugAuto] = useState(true);
  const [editing, setEditing] = useState<{ id: number; name: string; slug: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  const done = (message: string) => {
    toast.show({ message });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    void queryClient.invalidateQueries({ queryKey: ['meta'] });
  };
  const fail = (e: unknown) =>
    toast.show({ message: errorMessage(e, s.common.genericError), durationMs: 8000 });

  const create = useMutation({
    mutationFn: () => adminApi.createCategory({ slug: slug.trim(), name: name.trim() }),
    onSuccess: () => {
      setSlug('');
      setName('');
      setSlugAuto(true);
      done(s.categories.created);
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: (v: { id: number; body: { slug?: string; name?: string; isActive?: boolean } }) =>
      adminApi.patchCategory(v.id, v.body),
    onSuccess: () => {
      setEditing(null);
      done(s.categories.updated);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminApi.deleteCategory(id),
    onSuccess: () => {
      setDeleting(null);
      done(s.categories.deleted);
    },
    onError: (e) => {
      setDeleting(null);
      fail(e);
    },
  });
  const reorder = useMutation({
    mutationFn: (order: number[]) => adminApi.reorderCategories(order),
    onSuccess: () => done(s.categories.updated),
    onError: fail,
  });

  const categories = list.data?.categories ?? [];

  const slugValue = slug.trim();
  const takenBy = categories.find((c) => c.slug === slugValue);
  const slugError = !slugValue
    ? null
    : !categorySlugSchema.safeParse(slugValue).success
      ? s.categories.slugInvalid
      : takenBy
        ? s.categories.slugTaken(takenBy.name)
        : null;
  const slugNote = name.trim() && !slugValue ? s.categories.slugNeeded : s.categories.slugHelp;
  const canAdd = !!slugValue && !!name.trim() && !slugError && !create.isPending;

  const move = (index: number, delta: number) => {
    const order = categories.map((c) => c.id);
    const [id] = order.splice(index, 1);
    order.splice(index + delta, 0, id!);
    reorder.mutate(order);
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.categories.title}</PageTitle>
      <form
        className="grid gap-3 rounded-[14px] border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_auto] md:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          if (canAdd) create.mutate();
        }}
      >
        <Field id={ids.name} label={s.categories.name}>
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
        <Field id={ids.slug} label={s.categories.slug}>
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
          + {s.categories.add}
        </button>
      </form>

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : categories.length === 0 ? (
        <p className="py-8 text-center text-muted">{s.categories.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.categories.title}>
          {categories.map((c, index) => (
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
                    aria-label={s.categories.name}
                    value={editing.name}
                    maxLength={60}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className={`${inputClass} md:w-56`}
                  />
                  <input
                    autoComplete="off"
                    aria-label={s.categories.slug}
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
                    {c.slug} · {s.categories.items(c.itemCount)}
                  </p>
                </div>
              )}
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.isActive}
                  aria-label={s.categories.activeLabel(c.name)}
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
                  disabled={index === categories.length - 1 || reorder.isPending}
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
          title={s.categories.deleteTitle(deleting.name)}
          body={s.categories.deleteBody}
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

/** `/admin/languages` (FR-A35). */
export function LanguagesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const list = useQuery({ queryKey: ['admin', 'languages'], queryFn: adminApi.languages });
  const toggle = useMutation({
    mutationFn: (v: { code: string; isActive: boolean }) =>
      adminApi.setLanguageActive(v.code, v.isActive),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'languages'], data);
      void queryClient.invalidateQueries({ queryKey: ['meta'] });
    },
    onError: (e) => toast.show({ message: errorMessage(e, s.common.genericError) }),
  });
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>{s.languages.title}</PageTitle>
      <p className="text-sm text-muted">{s.languages.help}</p>
      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label={s.languages.title}>
          {list.data.languages.map((l) => (
            <li
              key={l.code}
              className="flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {l.name}{' '}
                  <span lang={l.code} dir={l.dir} className="text-muted">
                    ({l.nativeName})
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {l.code} · {s.languages.direction}: {l.dir.toUpperCase()} · {s.languages.script}:{' '}
                  {l.script}
                </p>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={l.isActive}
                  aria-label={s.languages.activeLabel(l.name)}
                  disabled={toggle.isPending}
                  onChange={(e) => toggle.mutate({ code: l.code, isActive: e.target.checked })}
                  className="h-5 w-5 accent-[var(--accent)]"
                />
                {l.isActive ? s.common.active : s.common.inactive}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
