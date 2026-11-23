import type { practiceSummary } from '@myvocab/core';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Button3D } from '../../components/Button3D';
import { BackArrow, HomeIcon, KeyboardIcon } from '../../components/Icons';
import { startGoogleSignIn } from '../../lib/session';
import { strings } from '../../strings';
import {
  CELEBRATION_MS,
  Confetti,
  Crown,
  SoundToggle,
  useApplause,
  useSoundSetting,
} from './Celebration';
import { useCountdown } from './useCountdown';

/** Animations are skipped for "reduce motion" (and where it can't be detected, e.g. tests). */
function motionAllowed(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

/** Moves keyboard focus to the main action of a screen when it appears. */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

/** Seconds before the break moves on by itself, when the practice doesn't say (D-067, D-068). */
export const DEFAULT_CONTINUE_SECONDS = 10;

/**
 * The break between rounds (PRD FR-L31, D-067): "Round 3 · 2 cards left", what was known, then
 * Home and Continue side by side as on the summary. Continue counts down and moves on by itself.
 */
export function RoundBreak({
  round,
  remaining,
  knew,
  total,
  onContinue,
  onBack,
  onHome,
  paused = false,
  seconds = DEFAULT_CONTINUE_SECONDS,
}: {
  round: number;
  remaining: number;
  /** Known in the round that just ended, of `total` cards. */
  knew: number;
  total: number;
  onContinue: () => void;
  onBack: () => void;
  /** Asks first (the dialog lives in the practice page). */
  onHome: () => void;
  /** The "Are you sure?" question is open: the countdown waits. */
  paused?: boolean;
  /** Countdown length, an admin setting (D-068); 0 = none. */
  seconds?: number;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  const { left, counting, running } = useCountdown(seconds, onContinue, { paused });
  return (
    <section className="glass m-auto flex w-full max-w-lg flex-col items-center gap-8 px-6 py-12 text-center">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {strings.practice.roundBreak(round, remaining)}
        </h1>
        <p className="text-muted">{strings.practice.roundRecap(knew, total, remaining)}</p>
      </div>
      <div className="flex items-start gap-3">
        <Button3D
          variant="stop"
          onClick={onHome}
          aria-label={strings.summary.home}
          title={strings.summary.home}
        >
          {/* A house, not the word (D-086). */}
          <HomeIcon className="h-6 w-6" />
        </Button3D>
        <div className="flex flex-col items-center gap-2">
          <Button3D
            ref={focusRef}
            onClick={onContinue}
            className="relative overflow-hidden"
            data-testid="continue"
          >
            {strings.practice.continue}
            {counting && <span aria-hidden="true">{` · ${left}`}</span>}
            {counting && (
              // The time left, draining across the button (not with "reduce motion").
              <span
                aria-hidden="true"
                className="countdown-fill"
                style={{
                  animationDuration: `${seconds}s`,
                  animationPlayState: running ? 'running' : 'paused',
                }}
              />
            )}
          </Button3D>
          <span className="lbtn__caption">{strings.practice.continueCaption}</span>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {counting ? strings.practice.continuingIn(seconds) : ''}
      </p>
      <BackToLastCard onBack={onBack} />
    </section>
  );
}

/** End of practice (PRD FR-L32). "New practice" starts the next practice with the same choices. */
export function Summary({
  summary,
  isGuest,
  onNewPractice,
  onHome,
  onBack,
  celebrate,
  onCelebrated,
  starting = false,
  newPracticeDisabled = false,
  startingLabel,
  error = null,
  turnstileRef,
}: {
  summary: ReturnType<typeof practiceSummary>;
  isGuest: boolean;
  onNewPractice: () => void;
  onHome: () => void;
  onBack: () => void;
  /** First time on the summary in this practice: celebrate. Later visits (after Back) don't. */
  celebrate: boolean;
  onCelebrated: () => void;
  /** The next practice is being started (New practice). */
  starting?: boolean;
  /** Not ready to start the next practice yet (its settings are loading). */
  newPracticeDisabled?: boolean;
  startingLabel?: string;
  /** Why the next practice couldn't start (shown under the buttons). */
  error?: string | null;
  /** Where a guest's interactive security check may appear. */
  turnstileRef?: Ref<HTMLDivElement>;
}) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  // The celebration (FR-L32a), once per practice: confetti (not with "reduce motion") and applause
  // (if sound is on), then the crown flies onto the card. On later visits the crown just sits there.
  const [first] = useState(celebrate);
  const [motion] = useState(motionAllowed);
  const [sound, setSound] = useSoundSetting();
  useApplause(sound && first);
  const [crown, setCrown] = useState<'none' | 'fly' | 'sit'>(first && motion ? 'none' : 'sit');
  useEffect(() => {
    if (!first) return;
    onCelebrated();
    if (!motion) return;
    const id = window.setTimeout(() => setCrown('fly'), CELEBRATION_MS);
    return () => window.clearTimeout(id);
    // Runs once, when the summary appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stats = [
    [strings.summary.cards, summary.totalCards],
    [strings.summary.rounds, summary.rounds],
    [strings.summary.alreadyKnew, summary.alreadyKnew],
    [strings.summary.learnedHere, summary.learnedHere],
  ] as const;
  return (
    <section className="glass relative m-auto flex w-full max-w-lg flex-col items-center gap-6 px-6 py-10 text-center">
      {crown !== 'none' && <Crown fly={crown === 'fly'} />}
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
        <Button3D
          variant="stop"
          onClick={onHome}
          aria-label={strings.summary.home}
          title={strings.summary.home}
        >
          {/* A house, not the word (D-086). */}
          <HomeIcon className="h-6 w-6" />
        </Button3D>
        <Button3D ref={focusRef} onClick={onNewPractice} disabled={starting || newPracticeDisabled}>
          {starting && startingLabel ? startingLabel : strings.summary.newPractice}
        </Button3D>
      </div>
      {turnstileRef && <div ref={turnstileRef} className="flex justify-center empty:hidden" />}
      {error && (
        <p role="alert" className="max-w-md text-sm text-dontknow">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <BackToLastCard onBack={onBack} />
        <SoundToggle on={sound} onChange={setSound} />
      </div>
      {first && motion && <Confetti />}
    </section>
  );
}

/** "← Back to the last card" on the break between rounds and the summary (PRD FR-L29a). */
function BackToLastCard({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-muted hover:text-text"
    >
      <BackArrow /> {strings.practice.backToCard}
    </button>
  );
}

/**
 * "⌨ Keyboard shortcuts" in the practice header (PRD FR-L34): a small popover, desktop only. `K` (the
 * green "Don't show again") is listed only for signed-in learners (D-042).
 */
export function ShortcutsMenu({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Esc closes the popover first; otherwise it would stop the practice.
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
        {strings.practice.shortcutsTitle}
      </button>
      {open && (
        <div id={panelId} className="glass absolute end-0 z-30 mt-2 w-64 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {strings.practice.shortcuts
              .filter(([key]) => signedIn || key !== 'K')
              .map(([key, action]) => (
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
