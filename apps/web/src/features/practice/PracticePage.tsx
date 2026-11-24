import {
  answerOf,
  canDispatch,
  currentCardId,
  practiceProgress,
  practiceReducer,
  practiceSummary,
  type KnownMark,
  type PracticeActionType,
} from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { startGoogleSignIn, useSession } from '../../lib/session';
import { strings } from '../../strings';
import { useKnownQueue } from '../known/KnownQueueProvider';
import { useStartPractice, type PracticeStartNotice } from '../setup/useStartPractice';
import { AppVersion } from '../../components/AppVersion';
import { HomeIcon, LogoMark } from '../../components/Icons';
import { ButtonBar } from './ButtonBar';
import { FlipCard } from './FlipCard';
import { clearPractice, loadPractice, savePractice, type StoredPractice } from './practice-storage';
import { RoundBreak, DEFAULT_CONTINUE_SECONDS, ShortcutsMenu, Summary } from './PracticeScreens';
import { FireworkGhost } from './FireworkGhost';
import { RollGhost, type KnowRoll } from './RollGhost';
import { useCountdown } from './useCountdown';
import { usePracticeShortcuts } from './usePracticeShortcuts';
import { RoundBar } from './RoundBar';
import { SlideGhost, type CardSlide } from './SlideGhost';
import { useSwipe } from './useSwipe';

/** How long "Sign-in required" covers the locked green button (D-043). */
const LOCKED_TIP_MS = 1500;
/** The nudge (D-066): full on the first cards of each round, then only when the user waits. */
const NUDGE_CARDS = 3;
const NUDGE_DELAY_MS = 300;
const NUDGE_IDLE_MS = 4000;
/** While the user still waits, a soft shine (no pump) repeats this often (D-074). */
const SHINE_EVERY_MS = 10_000;
/** Long enough for the staggered pump and shine to finish (base.css). */
const NUDGE_MS = 1700;

/** A full nudge (pump, then shine) or the shine alone (the repeats, D-074). */
export type NudgeKind = 'full' | 'shine';
/** Next's countdown after "I don't know", when the practice doesn't say (D-069). */
const DEFAULT_NEXT_SECONDS = 10;

/**
 * How the buttons should nudge now (D-066, D-074). `step` changes whenever the screen changes state
 * (a new card, a flip, hints, Don't know). On the first cards of a round every change nudges,
 * shortly after; after that, only a pause of a few seconds does. While the user still waits, a
 * soft shine repeats every 10 seconds. Off for "reduce motion".
 */
function useNudge(step: string, full: boolean, enabled: boolean): NudgeKind | null {
  // What is playing, and for which step: a new step drops the class, so the next one restarts.
  const [playing, setPlaying] = useState<{ step: string; kind: NudgeKind } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const timers: number[] = [];
    const play = (kind: NudgeKind) => {
      setPlaying({ step, kind });
      timers.push(window.setTimeout(() => setPlaying(null), NUDGE_MS));
    };
    if (full) timers.push(window.setTimeout(() => play('full'), NUDGE_DELAY_MS));
    timers.push(window.setTimeout(() => play('full'), NUDGE_IDLE_MS));
    const shine = window.setInterval(() => play('shine'), SHINE_EVERY_MS);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(shine);
    };
  }, [step, full, enabled]);
  return playing?.step === step ? playing.kind : null;
}

export type KnownSink = {
  /** A Know was made (signed-in learners queue it, PRD §6.4). */
  onKnow(mark: KnownMark, target: string): void;
  /** A Know was changed to Don't know on a card reached with Back (FR-L29a); in that direction. */
  onUnknow(itemId: number, target: string): void;
};

const noopSink: KnownSink = { onKnow: () => undefined, onUnknow: () => undefined };

/**
 * The practice screen. Signed-in learners' Know marks go to the Know queue (PRD §6.4); guests' marks
 * go nowhere (FR-L55). `knownSink` overrides the queue (tests).
 *
 * Keyed by the history entry: "New practice" on the summary saves the next practice and navigates to
 * /practice again, which mounts a fresh screen that loads it (FR-L32).
 */
export function PracticePage({ knownSink }: { knownSink?: KnownSink }) {
  const location = useLocation();
  return <PracticeScreen key={location.key} {...(knownSink ? { knownSink } : {})} />;
}

const META_QUERY = { queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 } as const;

function PracticeScreen({ knownSink }: { knownSink?: KnownSink }) {
  const [stored] = useState<StoredPractice | null>(() => loadPractice());
  // Loaded early (usually cached from the start card), so "New practice" is ready at the end.
  useQuery(META_QUERY);
  const queue = useKnownQueue();
  const sink = useMemo<KnownSink>(() => {
    if (knownSink) return knownSink;
    if (!queue || !stored || stored.isGuest) return noopSink;
    // A Know waits this long before it's sent, so a quick change of mind costs no request.
    const delayMs = stored.undoWindowSeconds * 1000;
    return {
      onKnow: (mark, target) => queue.add({ itemId: mark.id, target, round: mark.round }, delayMs),
      // Drops a pending mark, or deletes it on the server if it was already sent (FR-L53).
      onUnknow: (itemId, target) => queue.undo(itemId, target),
    };
  }, [knownSink, queue, stored]);

  // Leaving the practice screen ends every waiting period: pending marks become final.
  useEffect(() => () => queue?.finalizeAll(), [queue]);

  if (!stored) return <Navigate to="/" replace />;
  return <Practice stored={stored} knownSink={sink} />;
}

function Practice({ stored, knownSink }: { stored: StoredPractice; knownSink: KnownSink }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [state, dispatch] = useReducer(practiceReducer, stored.state);
  const cards = useMemo(() => new Map(stored.cards.map((c) => [c.itemId, c])), [stored.cards]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState('');
  // Stop and Home both ask before ending the practice (PRD FR-L30, FR-L30a).
  // Home (or Esc) asks before ending the practice (PRD FR-L30a; there is no Stop button, D-072).
  const [confirmLeave, setConfirmLeave] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [roll, setRoll] = useState<KnowRoll | null>(null);
  const clearRoll = useCallback(() => setRoll(null), []);
  // Next and Back: the old card slides out sideways while the new one slides in (D-110).
  const [slide, setSlide] = useState<CardSlide | null>(null);
  const clearSlide = useCallback(() => setSlide(null), []);
  // Where the next card comes in from: the right for Next and the Knows (a little later, under the
  // Know animation), the left for Back; a new round's first card rises in (D-110).
  // Opened and closed the hints cover once: it stops showing it can be tapped, for the rest of
  // the practice (D-121).
  const [coverLearned, setCoverLearned] = useState(false);
  const learnCover = useCallback(() => setCoverLearned(true), []);
  const [enterFrom, setEnterFrom] = useState<'right' | 'know' | 'left' | 'rise'>('rise');

  // The summary celebrates once per practice (FR-L32a), also across Back and a refresh.
  const [celebrated, setCelebrated] = useState(stored.celebrated ?? false);
  const markCelebrated = useCallback(() => setCelebrated(true), []);
  // Flip pulses until it's first used in the practice, also across a refresh (D-066).
  const [flipped, setFlipped] = useState(stored.flipped ?? false);
  // The card Flip was last used on: it stops nudging there (D-074).
  const [flippedCard, setFlippedCard] = useState<string | null>(null);
  // The card the red loop runs around, right after "I don't know" (D-106).
  const [tracedCard, setTracedCard] = useState<string | null>(null);

  // Persist on every change; Stop and the end of the practice clear it (FR-L33).
  useEffect(() => {
    if (state.phase === 'stopped' || state.phase === 'finished') clearPractice();
    else savePractice({ ...stored, state, celebrated, flipped });
    if (state.phase === 'stopped') navigate('/', { replace: true });
  }, [state, stored, navigate, celebrated, flipped]);

  // "Only N new cards in Home…" once, when the practice starts (FR-L8).
  const notice = (location.state as PracticeStartNotice | null)?.insufficient;
  useEffect(() => {
    if (notice) toast.show({ message: notice });
  }, [notice, toast]);

  // After Don't know, Next receives focus (FR-L28).
  useEffect(() => {
    if (state.phase === 'revealed') nextRef.current?.focus();
  }, [state.phase, state.index, state.round]);

  const act = useCallback(
    (type: PracticeActionType, swiped = false) => {
      if (!canDispatch(state, type)) return;
      const id = currentCardId(state);
      // On a card reached with Back the answer can change (FR-L29a); only changes reach the queue.
      const before = id === null ? null : answerOf(state, id);
      // Know · ask again is never recorded (FR-L27a): leaving a Know for it drops the Know.
      if ((type === 'DONT_KNOW' || type === 'KNOW_AGAIN') && id !== null && before === 'know')
        knownSink.onUnknow(id, cards.get(id)?.direction.target ?? '');
      if ((type === 'KNOW' || type === 'KNOW_AGAIN') && id !== null) {
        const mark = { id, round: state.round };
        if (type === 'KNOW' && before !== 'know')
          knownSink.onKnow(mark, cards.get(id)?.direction.target ?? '');
        // The green Know bursts like a firework at the "known" counter (D-103); the orange one
        // rolls up like paper and flies into it (PRD §9.4, D-094).
        const known = cards.get(id);
        const from = cardRef.current?.getBoundingClientRect();
        const to = counterRef.current?.getBoundingClientRect();
        // The last card of a round leads to the break or the summary, which have no counter to fly
        // to: no animation there (it would play over that screen).
        const lastOfRound = state.index === state.order.length - 1;
        if (known && from && to && motionAllowed() && !lastOfRound) {
          setRoll({
            key: Date.now(),
            card: known,
            side: state.side,
            hintsShown: state.hintsShown,
            again: type === 'KNOW_AGAIN',
            kind: type === 'KNOW' ? 'firework' : 'roll',
            rect: { top: from.top, left: from.left, width: from.width, height: from.height },
            dx: to.left + to.width / 2 - (from.left + from.width / 2),
            dy: to.top + to.height / 2 - (from.top + from.height / 2),
          });
        }
      }
      if (type === 'BACK') {
        const offCard = state.phase === 'roundBreak' || state.phase === 'finished';
        const to = (offCard ? state.order.length : state.index) - 1;
        const answer = answerOf(state, state.order[to]!);
        setAnnouncement(
          strings.card.backTo(
            to + 1,
            state.order.length,
            answer === 'know'
              ? strings.card.answeredKnow
              : answer === 'knowAgain'
                ? strings.card.answeredKnowAgain
                : answer === 'dontKnow'
                  ? strings.card.answeredDontKnow
                  : null,
          ),
        );
      }
      // "I don't know" sends a red loop around the card (D-106); moving on drops it.
      if (type === 'DONT_KNOW') setTracedCard(`${state.round}-${state.index}-${Date.now()}`);
      if (type === 'NEXT' || type === 'BACK' || type === 'CONTINUE') setTracedCard(null);
      if (type === 'FLIP') {
        setFlipped(true);
        setFlippedCard(`${state.round}-${state.index}`);
        setAnnouncement(
          state.side === 'front' ? strings.card.showingAnswer : strings.card.showingFront,
        );
      }
      if (type === 'DONT_KNOW' && state.side === 'front')
        setAnnouncement(strings.card.showingAnswer);
      if (type === 'TOGGLE_HINTS')
        setAnnouncement(state.hintsShown ? strings.card.hintsHidden : strings.card.hintsShown);
      // A new round after the celebration means the practice will be completed anew: celebrate
      // (and fly the crown) again when it ends (FR-L32a).
      if (type === 'CONTINUE') setCelebrated(false);
      // The slide between cards (D-110). A swipe has already moved the old card out; the last card
      // of a round leads to the break or the summary, and the break has no card to slide.
      if (type === 'NEXT' || type === 'BACK' || type === 'KNOW' || type === 'KNOW_AGAIN')
        setEnterFrom(type === 'BACK' ? 'left' : type === 'NEXT' ? 'right' : 'know');
      if (type === 'CONTINUE') setEnterFrom('rise');
      const onCard = state.phase === 'deciding' || state.phase === 'revealed';
      const lastOfRound = state.index === state.order.length - 1;
      const shown = id === null ? undefined : cards.get(id);
      const from = cardRef.current?.getBoundingClientRect();
      const leaves = type === 'BACK' || (type === 'NEXT' && !lastOfRound);
      if (leaves && onCard && !swiped && shown && from && id !== null && motionAllowed()) {
        setSlide({
          key: Date.now(),
          card: shown,
          side: state.side,
          hintsShown: state.hintsShown,
          answer: answerOf(state, id),
          rect: { top: from.top, left: from.left, width: from.width, height: from.height },
          to: type === 'BACK' ? 'right' : 'left',
        });
      }
      dispatch({ type });
    },
    [state, cards, knownSink],
  );

  // A guest tapped the locked green button, or pressed K: "Sign-in required" covers that button
  // for 1.5 seconds (D-043), rather than a toast that would cover the orange one on phones.
  const [lockedTip, setLockedTip] = useState(false);
  const lockedTimer = useRef<number | undefined>(undefined);
  const showLocked = useCallback(() => {
    setLockedTip(true);
    window.clearTimeout(lockedTimer.current);
    lockedTimer.current = window.setTimeout(() => setLockedTip(false), LOCKED_TIP_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(lockedTimer.current), []);

  const onShortcut = useCallback(
    (action: PracticeActionType | 'ENTER') => {
      if (confirmLeave) return; // the "are you sure?" question is open
      // "Never show again" needs signing in (D-042); K says so, like tapping the button (D-043).
      if (action === 'KNOW' && stored.isGuest) return showLocked();
      if (action === 'ENTER') act(state.phase === 'roundBreak' ? 'CONTINUE' : 'NEXT');
      else if (action === 'STOP')
        setConfirmLeave(true); // Esc: the same question as Home
      else act(action);
    },
    [act, state.phase, confirmLeave, stored.isGuest, showLocked],
  );
  usePracticeShortcuts(onShortcut);

  const nudging = useNudge(
    `${state.round}-${state.index}-${state.phase}-${state.side}-${state.hintsShown}`,
    state.index < NUDGE_CARDS,
    !confirmLeave && motionAllowed(),
  );

  // After "I don't know", Next counts down and moves on by itself; any tap, key or scroll stops
  // it (D-069). Only in the Revealed phase, not on a card reached with Back.
  const nextSeconds = stored.nextSeconds ?? DEFAULT_NEXT_SECONDS;
  const next = useCountdown(nextSeconds, () => act('NEXT'), {
    enabled: state.phase === 'revealed',
    paused: confirmLeave,
    resetKey: `${state.round}-${state.index}-${state.phase}`,
  });

  const progress = practiceProgress(state);
  const id = currentCardId(state);
  const card = id === null ? undefined : cards.get(id);
  // The chip shows the answer given to this card: right after "I don't know" (both faces, D-104),
  // and on a card that already had an answer when it came up (reached with Back).
  const shownAnswer =
    id !== null && (state.phase === 'deciding' || state.phase === 'revealed')
      ? answerOf(state, id)
      : null;
  // Next sits on the right in every language (D-096): swipe left for Next, right for Back.
  const [swipeLeft, swipeRight] = ['NEXT', 'BACK'] as const;
  const swipeRef = useSwipe({
    canLeft: canDispatch(state, swipeLeft),
    canRight: canDispatch(state, swipeRight),
    onLeft: () => act(swipeLeft, true),
    onRight: () => act(swipeRight, true),
    enabled: !confirmLeave,
    animate: motionAllowed(),
  });

  const slideGhost = slide && <SlideGhost key={slide.key} slide={slide} onDone={clearSlide} />;
  const ghost = !roll ? null : roll.kind === 'firework' ? (
    <FireworkGhost key={roll.key} roll={roll} onDone={clearRoll} />
  ) : (
    <RollGhost key={roll.key} roll={roll} onDone={clearRoll} />
  );
  const [progressHead, progressKnown] = splitKnown(
    strings.practice.progress(
      progress.round,
      progress.cardNumber,
      progress.roundSize,
      progress.knownCount,
    ),
  );

  // "Back to Home?" on the practice screen and on the break between rounds (FR-L30a, D-067).
  const leaveDialog = confirmLeave && (
    <ConfirmDialog
      title={strings.practice.homeConfirmTitle}
      body={strings.practice.homeConfirmBody}
      confirmLabel={strings.practice.yes}
      cancelLabel={strings.practice.no}
      onConfirm={() => {
        setConfirmLeave(false);
        act('STOP');
      }}
      onCancel={() => setConfirmLeave(false)}
    />
  );

  if (state.phase === 'roundBreak') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <RoundBreak
          round={state.round + 1}
          remaining={progress.remaining}
          knew={progress.roundSize - progress.remaining}
          total={progress.roundSize}
          onContinue={() => act('CONTINUE')}
          onBack={() => act('BACK')}
          onHome={() => setConfirmLeave(true)}
          paused={confirmLeave}
          seconds={stored.continueSeconds ?? DEFAULT_CONTINUE_SECONDS}
        />
        {leaveDialog}
      </main>
    );
  }
  if (state.phase === 'finished') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <FinishedScreen
          stored={stored}
          summary={practiceSummary(state)}
          onBack={() => act('BACK')}
          celebrate={!celebrated}
          onCelebrated={markCelebrated}
        />
      </main>
    );
  }
  if (!card) return null;

  return (
    <main
      id="main"
      className="mx-auto flex h-dvh w-full max-w-[1100px] flex-col gap-5 px-4 pt-4 md:h-auto md:min-h-dvh md:gap-10 md:px-8 md:pt-8"
    >
      <header className="relative flex items-center justify-between gap-3">
        <RoundBar state={state} />
        <p
          className="flex items-center gap-3 text-base font-medium md:text-xl"
          data-testid="progress"
        >
          <LogoMark className="h-8 w-8 shrink-0 md:h-10 md:w-10" />
          <span>
            {progressHead}
            <span
              ref={counterRef}
              key={progress.knownCount}
              className={`inline-block ${roll ? `count-pop ${roll.again ? 'count-pop--again' : ''} ${roll.kind === 'firework' ? 'count-pop--firework' : ''}` : ''}`}
            >
              {progressKnown}
            </span>
          </span>
        </p>
        <div className="flex items-center gap-2 md:gap-4">
          <ShortcutsMenu signedIn={!stored.isGuest} />
          {/* The version, centred just below Home (above the card), on phones and desktop alike
              (D-093): it takes no width, so the progress stays on one line. */}
          <div className="relative flex shrink-0 items-center">
            <AppVersion className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-[10px] leading-none md:text-xs" />
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              aria-label={strings.nav.home}
              title={strings.nav.home}
              // The only way out of a practice now (D-072): a clear bordered button, not a faint link;
              // a house, not the word (D-086).
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-practice)] border border-border text-text transition-colors hover:border-accent hover:text-accent"
            >
              <HomeIcon />
            </button>
          </div>
        </div>
        {leaveDialog}
      </header>

      <div
        key={`${state.round}-${state.index}`}
        ref={cardRef}
        className={`card-enter card-enter--${enterFrom} flex min-h-0 flex-1 flex-col md:h-[clamp(420px,58vh,600px)] md:flex-none`}
      >
        {/* The swipe moves this inner box: the rise-in animation owns the outer one's transform.
            Vertical drags stay with the page (touch-action: pan-y). */}
        <div ref={swipeRef} className="flex min-h-0 flex-1 touch-pan-y flex-col">
          <FlipCard
            card={card}
            side={state.side}
            hintsShown={state.hintsShown}
            onFlip={() => act('FLIP')}
            onToggleHints={() => act('TOGGLE_HINTS')}
            answer={shownAnswer}
            // An answer while still deciding means the card was reached with Back (D-108).
            answerArrived={state.phase === 'deciding'}
            coverLearned={coverLearned}
            onCoverLearned={learnCover}
            pulse={!flipped && motionAllowed()}
            trace={tracedCard?.startsWith(`${state.round}-${state.index}-`) ?? false}
            nudging={
              state.side === 'front' && flippedCard !== `${state.round}-${state.index}`
                ? nudging
                : null
            }
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <p className="sr-only" aria-live="polite">
        {next.counting ? strings.practice.nextIn(nextSeconds) : ''}
      </p>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-4 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-0 pb-4 md:relative md:mx-0 md:bg-none md:px-0 md:pb-8">
        <ButtonBar
          state={state}
          onAction={act}
          nextRef={nextRef}
          signedIn={!stored.isGuest}
          onLocked={showLocked}
          lockedTip={lockedTip}
          onSignIn={startGoogleSignIn}
          nudging={nudging}
          nextCountdown={
            next.counting ? { left: next.left, running: next.running, seconds: nextSeconds } : null
          }
        />
      </div>
      {ghost}
      {slideGhost}
    </main>
  );
}

/** "Round 1 · Card 2/5 · 1 known" → ["Round 1 · Card 2/5 · ", "1 known"]: the counter is the target. */
function splitKnown(text: string): [string, string] {
  const at = text.lastIndexOf(' · ') + 3;
  return [text.slice(0, at), text.slice(at)];
}

/** The roll is skipped for "reduce motion" (and where it can't be detected, e.g. tests). */
function motionAllowed(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

type FinishedProps = {
  stored: StoredPractice;
  summary: ReturnType<typeof practiceSummary>;
  onBack: () => void;
  celebrate: boolean;
  onCelebrated: () => void;
};

/**
 * The summary (FR-L32). "New practice" starts the next practice with the same choices right away; it
 * waits while the start settings (/api/meta) load, and if they can't load it falls back to the
 * start card, pre-filled. One Summary throughout, so the celebration never restarts.
 */
function FinishedScreen({ stored, ...rest }: FinishedProps) {
  const meta = useQuery(META_QUERY);
  const navigate = useNavigate();
  const session = useSession();
  // The signed-in state now, not when the practice started (a guest may have signed in since).
  const isGuest = session.loading ? stored.isGuest : session.isGuest;
  const { start, starting, error, setError, containerRef } = useStartPractice({
    meta: meta.data,
    isGuest,
  });
  const newPractice = () => {
    if (!meta.data) {
      navigate('/', { state: { selection: stored.selection } });
      return;
    }
    void start(stored.selection, { replace: true }).then((result) => {
      if (result === 'empty') setError(strings.summary.nothingLeft);
    });
  };
  return (
    <Summary
      {...rest}
      isGuest={stored.isGuest}
      onHome={() => navigate('/')}
      onNewPractice={newPractice}
      newPracticeDisabled={meta.isPending}
      starting={starting}
      startingLabel={isGuest ? strings.setup.botCheck : strings.setup.starting}
      error={error}
      turnstileRef={containerRef}
    />
  );
}
