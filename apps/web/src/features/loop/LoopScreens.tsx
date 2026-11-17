import type { loopSummary } from '@myvocab/core';
import { useEffect, useRef } from 'react';
import { Button3D } from '../../components/Button3D';
import { startGoogleSignIn } from '../../lib/session';
import { strings } from '../../strings';

/** Moves keyboard focus to the main action of a screen when it appears. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

/** "Cycle 3 · 2 cards left" with Continue (PRD FR-L31). */
export function CycleBreak({
  cycle,
  remaining,
  onContinue,
}: {
  cycle: number;
  remaining: number;
  onContinue: () => void;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-semibold">{strings.loop.cycleBreak(cycle, remaining)}</h1>
      <Button3D size="lg" ref={focusRef} onClick={onContinue}>
        {strings.loop.continue}
      </Button3D>
    </section>
  );
}

/** End of loop (PRD FR-L32). */
export function Summary({
  summary,
  isGuest,
  onNewLoop,
  onHome,
}: {
  summary: ReturnType<typeof loopSummary>;
  isGuest: boolean;
  onNewLoop: () => void;
  onHome: () => void;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  const stats = [
    [strings.summary.cards, summary.totalCards],
    [strings.summary.cycles, summary.cycles],
    [strings.summary.alreadyKnew, summary.alreadyKnew],
    [strings.summary.learnedHere, summary.learnedHere],
  ] as const;
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-semibold">{strings.summary.title}</h1>
      <dl className="grid w-full max-w-md grid-cols-2 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-[14px] border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-3xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {isGuest && (
        <button
          type="button"
          className="text-accent underline-offset-2 hover:underline"
          onClick={startGoogleSignIn}
        >
          {strings.summary.guestNote}
        </button>
      )}
      <div className="flex gap-3">
        <Button3D variant="stop" onClick={onHome}>
          {strings.summary.home}
        </Button3D>
        <Button3D ref={focusRef} onClick={onNewLoop}>
          {strings.summary.newLoop}
        </Button3D>
      </div>
    </section>
  );
}

/** The Undo bar after Know (PRD FR-L27): "Date → תאריך, תמר ✓ Undo". */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  const [front, answer] = label.split(' → ');
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3 rounded-[14px] border border-border bg-surface-2 px-4 py-2 text-sm shadow-lg"
    >
      <span className="truncate" data-testid="undo-label">
        <bdi>{front}</bdi> → <bdi>{answer}</bdi> <span aria-hidden="true">✓</span>
      </span>
      <button type="button" className="shrink-0 font-semibold text-accent" onClick={onUndo}>
        {strings.loop.undo}
      </button>
    </div>
  );
}
