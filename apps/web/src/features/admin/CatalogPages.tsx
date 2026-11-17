import type { AdminCategory } from '@myvocab/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';
import { adminApi, errorMessage } from './admin-api';
import { Badge, ErrorState, Field, ghostButton, inputClass, Loading, PageTitle } from './ui';

/** `/admin/categories` (FR-A30). */
export function CategoriesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const ids = { slug: useId(), name: useId() };
  const list = useQuery({ queryKey: ['admin', 'categories'], queryFn: adminApi.categories });
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
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
        className="grid gap-3 rounded-[14px] border border-border bg-surface p-4 md:grid-cols-[1fr_1fr_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field id={ids.name} label={s.categories.name}>
          <input
            id={ids.name}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field id={ids.slug} label={s.categories.slug}>
          <input
            id={ids.slug}
            value={slug}
            maxLength={50}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className={inputClass}
            placeholder="home-garden"
          />
        </Field>
        <button
          type="submit"
          className={ghostButton}
          disabled={!slug.trim() || !name.trim() || create.isPending}
        >
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
                    aria-label={s.categories.name}
                    value={editing.name}
                    maxLength={60}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className={`${inputClass} md:w-56`}
                  />
                  <input
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
