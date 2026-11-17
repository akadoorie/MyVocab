import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useToast } from '../../components/Toast';
import { adminStrings as s } from '../../strings-admin';

/**
 * The inline list editor (PRD FR-A12), used for translations, explanation, synonyms and hints.
 * Every change saves the whole list right away through `onSave` (PATCH with the item version);
 * it resolves to false when the save failed, and the list then stays as it was.
 */
export function ListEditor({
  label,
  entries,
  lang,
  dir,
  maxEntries,
  maxLength,
  onSave,
  help,
  numbered = false,
}: {
  label: string;
  entries: readonly string[];
  lang: string;
  dir: 'ltr' | 'rtl';
  maxEntries: number;
  maxLength: number;
  onSave: (next: string[]) => Promise<boolean>;
  help?: string;
  numbered?: boolean;
}) {
  const toast = useToast();
  const headingId = useId();
  const addId = useId();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const current = useRef(entries);
  useEffect(() => {
    current.current = entries;
  }, [entries]);

  async function save(next: string[]): Promise<boolean> {
    setBusy(true);
    try {
      return await onSave(next);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = draft.trim();
    if (!value || entries.length >= maxEntries) return;
    if (await save([...entries, value])) setDraft('');
  }

  async function commitEdit() {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value || value === entries[editing.index]) {
      setEditing(null);
      return;
    }
    const next = [...entries];
    next[editing.index] = value;
    if (await save(next)) setEditing(null);
  }

  async function remove(index: number) {
    const entry = entries[index];
    if (entry === undefined) return;
    if (!(await save(entries.filter((_, i) => i !== index)))) return;
    toast.show({
      message: s.list.deleted(entry),
      durationMs: 5000,
      action: {
        label: s.list.undo,
        onClick: () => {
          const latest = [...current.current];
          latest.splice(Math.min(index, latest.length), 0, entry);
          void save(latest);
        },
      },
    });
  }

  async function move(from: number, to: number) {
    if (to < 0 || to >= entries.length || from === to) return;
    const next = [...entries];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry!);
    await save(next);
  }

  function onEditKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(null);
    }
  }

  const iconButton =
    'flex min-h-10 min-w-10 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2" aria-busy={busy}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-semibold">
          {label}
        </h3>
        <span className="text-xs text-muted">
          {entries.length}/{maxEntries}
        </span>
      </div>
      {help && <p className="text-sm text-muted">{help}</p>}

      {entries.length === 0 ? (
        <p className="text-sm text-muted">{s.list.empty}</p>
      ) : (
        <ol className="flex flex-col gap-1.5" aria-labelledby={headingId}>
          {entries.map((entry, index) => (
            <li
              key={`${index}-${entry}`}
              onDragOver={(e) => dragFrom !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) void move(dragFrom, index);
                setDragFrom(null);
              }}
              className={`flex items-center gap-1 rounded-[10px] border bg-surface-2 px-2 py-1 ${dragFrom === index ? 'border-accent' : 'border-border'}`}
            >
              <button
                type="button"
                draggable={!busy}
                onDragStart={() => setDragFrom(index)}
                onDragEnd={() => setDragFrom(null)}
                aria-label={s.list.dragHandle(entry)}
                className={`${iconButton} hidden cursor-grab md:flex`}
                tabIndex={-1}
              >
                <span aria-hidden="true">⠿</span>
              </button>
              {numbered && <span className="w-6 shrink-0 text-sm text-muted">{index + 1}.</span>}
              {editing?.index === index ? (
                <input
                  value={editing.value}
                  onChange={(e) => setEditing({ index, value: e.target.value })}
                  onKeyDown={onEditKey}
                  onBlur={() => setEditing(null)}
                  maxLength={maxLength}
                  lang={lang}
                  dir="auto"
                  aria-label={s.list.editEntry(entry)}
                  ref={(el) => el?.focus()}
                  className="min-h-10 flex-1 rounded-[8px] border border-accent bg-surface px-2 outline-none"
                />
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing({ index, value: entry })}
                  aria-label={s.list.editEntry(entry)}
                  lang={lang}
                  dir={dir}
                  className="min-h-10 flex-1 rounded-[8px] px-2 text-start break-words hover:bg-surface"
                >
                  {entry}
                </button>
              )}
              <button
                type="button"
                disabled={busy || index === 0}
                onClick={() => void move(index, index - 1)}
                aria-label={s.list.moveUp(entry)}
                className={iconButton}
              >
                <span aria-hidden="true">↑</span>
              </button>
              <button
                type="button"
                disabled={busy || index === entries.length - 1}
                onClick={() => void move(index, index + 1)}
                aria-label={s.list.moveDown(entry)}
                className={iconButton}
              >
                <span aria-hidden="true">↓</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(index)}
                aria-label={s.list.deleteEntry(entry)}
                className={`${iconButton} hover:text-dontknow`}
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {entries.length < maxEntries ? (
        <div className="flex gap-2">
          <label htmlFor={addId} className="sr-only">
            {s.list.addPlaceholder(label)}
          </label>
          <input
            id={addId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            maxLength={maxLength}
            lang={lang}
            dir="auto"
            placeholder={s.list.newEntry}
            disabled={busy}
            className="min-h-11 flex-1 rounded-[10px] border border-border bg-surface-2 px-3 outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void add()}
            className="min-h-11 rounded-[10px] border border-border px-4 hover:border-accent disabled:opacity-40"
          >
            {s.list.add}
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">{s.list.full(maxEntries)}</p>
      )}
    </section>
  );
}
