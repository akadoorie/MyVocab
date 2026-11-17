import { useId, type ReactNode } from 'react';
import { strings } from '../strings';

/**
 * A labeled start-card field with the default/selected styling (PRD FR-L3, §9.5): a field that
 * still holds its default value is muted with a dashed outline and a "Default" tag.
 */
export function Field({
  label,
  isDefault,
  children,
}: {
  label: string;
  isDefault: boolean;
  children: (props: { id: string; className: string }) => ReactNode;
}) {
  const id = useId();
  const className = [
    'w-full rounded-[10px] bg-surface-2 px-3 py-3 text-base outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-accent',
    isDefault ? 'border border-dashed border-border text-muted' : 'border border-accent text-text',
  ].join(' ');
  return (
    <div className="flex flex-col gap-1.5" data-default={isDefault ? 'true' : 'false'}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-muted">
          {label}
        </label>
        {isDefault && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted">
            {strings.setup.defaultTag}
          </span>
        )}
      </div>
      {children({ id, className })}
    </div>
  );
}

/** A segmented control (radio group) used for Type and Amount. */
export function Segmented<T extends string | number>({
  id,
  options,
  value,
  onChange,
  isDefault,
  label,
}: {
  id: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  isDefault: boolean;
  label: string;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={[
        'grid gap-1 rounded-[10px] bg-surface-2 p-1',
        isDefault ? 'border border-dashed border-border' : 'border border-accent',
      ].join(' ')}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(o.value)}
            className={[
              'min-h-11 rounded-[8px] px-2 text-sm font-medium transition-colors',
              checked
                ? isDefault
                  ? 'bg-surface text-muted'
                  : 'bg-accent text-[var(--on-color)]'
                : 'text-muted hover:text-text',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
