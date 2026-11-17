import type { ReactNode } from 'react';
import { adminStrings as s } from '../../strings-admin';

/** Small shared building blocks of the admin pages. */

export const inputClass =
  'min-h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent';

export const ghostButton =
  'min-h-11 rounded-[10px] border border-border px-3 text-sm hover:border-accent disabled:opacity-40';

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{children}</h1>;
}

export function Loading() {
  return (
    <p className="py-8 text-center text-muted" aria-busy="true">
      {s.common.loading}
    </p>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="py-8 text-center">
      <p className="text-dontknow">{s.common.loadFailed}</p>
      <button type="button" className="mt-2 text-accent" onClick={onRetry}>
        {s.common.retry}
      </button>
    </div>
  );
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'know' | 'dontknow' | 'hint';
}) {
  const tones = {
    muted: 'border-border text-muted',
    accent: 'border-accent text-accent',
    know: 'border-know text-know',
    dontknow: 'border-dontknow text-dontknow',
    hint: 'border-hint text-hint',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Field({
  id,
  label,
  children,
  className = '',
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
