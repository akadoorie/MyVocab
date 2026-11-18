import type { loopSummary } from '@myvocab/core';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button3D } from '../../components/Button3D';
import { KeyboardIcon } from '../../components/Icons';
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
    <section className="glass m-auto flex w-full max-w-lg flex-col items-center gap-8 px-6 py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        {strings.loop.cycleBreak(cycle, remaining)}
      </h1>
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
    <section className="glass m-auto flex w-full max-w-lg flex-col items-center gap-6 px-6 py-10 text-center">
      <h1 className="text-3xl font-bold tracking-tight">{strings.summary.title}</h1>
      <dl className="grid w-full max-w-md grid-cols-2 gap-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-[16px] bg-white/5 p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-4xl font-bold">{value}</dd>
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

/**
 * The Undo bar after Know (PRD FR-L27): "Date → תאריך, תמר ✓ [Undo]". Compact (as wide as its
 * text), with a small 3D yellow Undo button.
 */
export function UndoBar({ label, onUndo }: { label: string; onUndo: () => void }) {
  const [front, answer] = label.split(' → ');
  return (
    <div
      role="status"
      className="inline-flex max-w-full items-center gap-3 rounded-full border border-[rgba(139,108,255,0.35)] bg-surface-2 py-1.5 pr-1.5 pl-4 text-sm shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
    >
      <span className="min-w-0 truncate" data-testid="undo-label">
        <bdi>{front}</bdi> → <bdi>{answer}</bdi> <span aria-hidden="true">✓</span>
      </span>
      <Button3D variant="hint" size="sm" className="shrink-0" onClick={onUndo}>
        {strings.loop.undo}
      </Button3D>
    </div>
  );
}

/** "⌨ Keyboard shortcuts" in the loop header (PRD FR-L34): a small popover, desktop only. */
export function ShortcutsMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Esc closes the popover first; otherwise it would stop the loop.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    }
  };
  return (
    <div className="relative hidden md:block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="flex min-h-11 items-center gap-3 rounded-[12px] px-2 text-[1.05rem] font-medium text-[#b9a6ff] hover:text-text"
      >
        <span className="flex h-7 w-9 items-center justify-center rounded-md bg-[#b9a6ff] text-bg [&_svg]:h-6 [&_svg]:w-6">
          <KeyboardIcon />
        </span>
        {strings.loop.shortcutsTitle}
      </button>
      {open && (
        <div id={panelId} className="glass absolute right-0 z-30 mt-2 w-64 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {strings.loop.shortcuts.map(([key, action]) => (
              <div key={key} className="contents">
                <dt>
                  <kbd className="rounded-md bg-white/10 px-2 py-0.5 font-sans text-xs font-semibold">
                    {key}
                  </kbd>
                </dt>
                <dd className="text-muted">{action}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
