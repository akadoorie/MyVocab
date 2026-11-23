import { useId, useRef, useState, type ReactNode } from 'react';
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

/** How far (px) a finger or mouse must move sideways before a press becomes a drag. */
const DRAG_START_PX = 8;

/**
 * A segmented control (radio group), used for Cards per practice. A violet pill marks the chosen
 * option and slides to a new one (D-098): tap an option, drag the pill (or anywhere on the track)
 * with a finger or the mouse, or use the arrow keys. A mostly vertical swipe still scrolls the
 * page. Disabled options stay visible, greyed out (D-057), and the pill never lands on them. It
 * follows the page direction: right to left in Hebrew.
 */
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
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; pointer: number; active: boolean } | null>(null);
  const swallowClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const index = options.findIndex((o) => o.value === value);
  const n = options.length;

  const buttons = () => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []),
  ];
  /** The enabled option nearest to a point on the screen. */
  const nearest = (clientX: number) => {
    let best = -1;
    let bestDistance = Infinity;
    buttons().forEach((b, i) => {
      if (options[i]?.disabled) return;
      const r = b.getBoundingClientRect();
      const distance = Math.abs(clientX - (r.left + r.width / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    return best;
  };
  const choose = (i: number, focus = false) => {
    const o = options[i];
    if (!o || o.disabled) return;
    if (o.value !== value) onChange(o.value);
    if (focus) buttons()[i]?.focus();
  };
  /** The next enabled option, `step` = +1 (towards the end) or -1. */
  const step = (from: number, by: 1 | -1) => {
    for (let i = from + by; i >= 0 && i < n; i += by) if (!options[i]?.disabled) return i;
    return from;
  };

  return (
    <div
      ref={ref}
      id={id}
      role="radiogroup"
      aria-label={label}
      // Focus goes to the chosen option (roving tab index); the group itself is not a tab stop.
      tabIndex={-1}
      className={[
        'relative grid touch-pan-y gap-1 rounded-[10px] bg-surface-2 p-1 select-none',
        isDefault ? 'border border-border' : 'border border-accent',
      ].join(' ')}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // A new press: a click left over from an earlier drag may not swallow this one's.
        swallowClick.current = false;
        drag.current = { x: e.clientX, pointer: e.pointerId, active: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pointer !== e.pointerId) return;
        if (!d.active) {
          if (Math.abs(e.clientX - d.x) < DRAG_START_PX) return;
          d.active = true;
          setDragging(true);
          ref.current?.setPointerCapture?.(e.pointerId);
        }
        choose(nearest(e.clientX));
      }}
      onPointerUp={() => {
        // A drag ends without the click that may follow on the button under the finger; if no
        // click comes, the guard lapses on its own.
        if (drag.current?.active) {
          swallowClick.current = true;
          window.setTimeout(() => (swallowClick.current = false), 400);
        }
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        const rtl = ref.current ? getComputedStyle(ref.current).direction === 'rtl' : false;
        const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
        const back = rtl ? 'ArrowRight' : 'ArrowLeft';
        let to = -1;
        if (e.key === forward || e.key === 'ArrowDown') to = step(index, 1);
        else if (e.key === back || e.key === 'ArrowUp') to = step(index, -1);
        else if (e.key === 'Home') to = step(-1, 1);
        else if (e.key === 'End') to = step(n, -1);
        if (to < 0) return;
        e.preventDefault();
        choose(to, true);
      }}
    >
      {index >= 0 && (
        // The pill under the chosen option; it slides (logical inset, so it mirrors in Hebrew).
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1 bottom-1 rounded-[8px] bg-accent-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_12px_rgba(106,62,245,0.45)] ${dragging ? '' : 'transition-[inset-inline-start] duration-200 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none'}`}
          style={{
            width: `calc((100% - 8px - ${4 * (n - 1)}px) / ${n})`,
            insetInlineStart: `calc(4px + ${index} * ((100% - 8px - ${4 * (n - 1)}px) / ${n} + 4px))`,
          }}
        />
      )}
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (index < 0 && i === 0) ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={[
              // 40px (36px on phones) + padding and border = the selects' height (D-056).
              'relative min-h-10 rounded-[8px] px-2 text-sm font-medium transition-colors max-md:min-h-9 max-md:px-0',
              checked
                ? 'text-[var(--on-color)]'
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
