import type { ReactNode } from 'react';

/**
 * Shows `shown`, but takes the width of the widest of `shown` and `others` (laid in the same grid
 * cell, the others invisible), so a button keeps the same size in both languages (D-127).
 */
export function SameWidth({ shown, others }: { shown: ReactNode; others: ReactNode[] }) {
  return (
    <span className="inline-grid justify-items-center">
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
