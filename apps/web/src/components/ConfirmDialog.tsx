import { useEffect, useId, useRef } from 'react';
import { Button3D } from './Button3D';

/**
 * A small modal confirmation (no `window.confirm`): focus moves into the dialog, Tab stays inside
 * it, Escape cancels, and focus returns to where it was.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable =
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const inside = dialogRef.current?.contains(document.activeElement) ?? false;
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="w-full max-w-md rounded-[14px] border border-border bg-surface p-5 shadow-[var(--card-shadow)]"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-muted">
          {body}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-[10px] px-4 text-muted hover:text-text"
          >
            {cancelLabel}
          </button>
          <Button3D disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button3D>
        </div>
      </div>
    </div>
  );
}
