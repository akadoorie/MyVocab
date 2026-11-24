import type { ReactNode } from 'react';

/**
 * Shows `shown`, but takes the size of the largest of `shown` and `others` (laid in the same grid
 * cell, the others invisible), so a button keeps the same size in both languages (D-127). With
 * `block`, it fills the line and keeps the height of the tallest (a heading that wraps onto two
 * lines in one language), so the content below doesn't move (D-129).
 */
export function SameWidth({
  shown,
  others,
  block = false,
}: {
  shown: ReactNode;
  others: ReactNode[];
  block?: boolean;
}) {
  return (
    <span className={`${block ? 'grid w-full items-center' : 'inline-grid'} justify-items-center`}>
      <span className="[grid-area:1/1]" data-shown>
        {shown}
      </span>
      {others.map((o, i) => (
        <span key={i} className="invisible [grid-area:1/1]" aria-hidden="true">
          {o}
        </span>
      ))}
    </span>
  );
}
