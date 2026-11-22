import { useId, type ReactNode } from 'react';
import { strings } from '../strings';

/**
 * A labeled start-card field with the default/selected styling (PRD FR-L3, §9.5): a default value
 * looks chosen (same background and bright text) with a subtle outline and a "Default" tag; a value
 * the user changed gets the violet outline. `inRow` fields share their line with another on phones,
 * so they drop the tag there and use a slimmer padding and text.
 */
export function Field({
  label,
  isDefault,
  inRow = false,
  children,
}: {
  label: string;
  isDefault: boolean;
  inRow?: boolean;
  children: (props: { id: string; className: string }) => ReactNode;
}) {
  const id = useId();
  const className = [
    // A fixed height, so every start-card field lines up with its neighbours (D-056).
    'h-[50px] w-full min-w-0 rounded-[10px] bg-surface-2 px-3 text-base max-md:h-[46px]',
    inRow ? 'max-md:px-2 max-md:text-sm' : '',
    ' outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-accent',
    'text-text',
    isDefault ? 'border border-border' : 'border border-accent',
  ].join(' ');
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-default={isDefault ? 'true' : 'false'}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium whitespace-nowrap text-muted">
          {label}
        </label>
        {isDefault && (
          <span
            className={`${inRow ? 'max-md:hidden ' : ''}rounded-full bg-[rgba(155,130,255,0.16)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-[#c4b5ff] uppercase`}
          >
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
  /** A disabled option stays visible, greyed out (D-057). */
  options: readonly { value: T; label: string; disabled?: boolean }[];
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
        isDefault ? 'border border-border' : 'border border-accent',
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
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={[
              // 40px (36px on phones) + padding and border = the selects' height (D-056).
              'min-h-10 rounded-[8px] px-2 text-sm font-medium transition-colors max-md:min-h-9 max-md:px-0',
              checked
                ? 'bg-accent-strong text-[var(--on-color)]'
                : 'text-muted enabled:hover:text-text disabled:cursor-not-allowed disabled:opacity-35',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
