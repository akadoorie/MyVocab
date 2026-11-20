import {
  answerOf,
  canDispatch,
  currentCardId,
  loopProgress,
  loopReducer,
  loopSummary,
  type KnownMark,
  type LoopActionType,
} from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { strings } from '../../strings';
import { useKnownQueue } from '../known/KnownQueueProvider';
import { useStartLoop, type LoopStartNotice } from '../setup/useStartLoop';
import { LogoMark } from '../../components/Icons';
import { ButtonBar } from './ButtonBar';
import { FlipCard } from './FlipCard';
import { clearLoop, loadLoop, saveLoop, type StoredLoop } from './loop-storage';
import { CycleBreak, ShortcutsMenu, Summary } from './LoopScreens';
import { CrumpleGhost, type Crumple } from './CrumpleGhost';
import { useLoopShortcuts } from './useLoopShortcuts';
import { useSwipe } from './useSwipe';

export type KnownSink = {
  /** A Know was made (signed-in learners queue it, PRD §6.4). */
  onKnow(mark: KnownMark, target: string): void;
  /** A Know was changed to Don't know on a card reached with Back (FR-L29a); in that direction. */
  onUnknow(itemId: number, target: string): void;
};

const noopSink: KnownSink = { onKnow: () => undefined, onUnknow: () => undefined };

/**
 * The loop screen. Signed-in learners' Know marks go to the Know queue (PRD §6.4); guests' marks
 * go nowhere (FR-L55). `knownSink` overrides the queue (tests).
 *
 * Keyed by the history entry: "New session" on the summary saves the next loop and navigates to
 * /loop again, which mounts a fresh screen that loads it (FR-L32).
 */
export function LoopPage({ knownSink }: { knownSink?: KnownSink }) {
  const location = useLocation();
  return <LoopScreen key={location.key} {...(knownSink ? { knownSink } : {})} />;
}

const META_QUERY = { queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 } as const;

function LoopScreen({ knownSink }: { knownSink?: KnownSink }) {
  const [stored] = useState<StoredLoop | null>(() => loadLoop());
  // Loaded early (usually cached from the start card), so "New session" is ready at the end.
  useQuery(META_QUERY);
  const queue = useKnownQueue();
  const sink = useMemo<KnownSink>(() => {
    if (knownSink) return knownSink;
    if (!queue || !stored || stored.isGuest) return noopSink;
    // A Know waits this long before it's sent, so a quick change of mind costs no request.
    const delayMs = stored.undoWindowSeconds * 1000;
    return {
      onKnow: (mark, target) => queue.add({ itemId: mark.id, target, cycle: mark.cycle }, delayMs),
      // Drops a pending mark, or deletes it on the server if it was already sent (FR-L53).
      onUnknow: (itemId, target) => queue.undo(itemId, target),
    };
  }, [knownSink, queue, stored]);

  // Leaving the loop screen ends every waiting period: pending marks become final.
  useEffect(() => () => queue?.finalizeAll(), [queue]);

  if (!stored) return <Navigate to="/" replace />;
  return <Loop stored={stored} knownSink={sink} />;
}

function Loop({ stored, knownSink }: { stored: StoredLoop; knownSink: KnownSink }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [state, dispatch] = useReducer(loopReducer, stored.state);
  const cards = useMemo(() => new Map(stored.cards.map((c) => [c.itemId, c])), [stored.cards]);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState('');
  // Stop and Home both ask before ending the session (PRD FR-L30, FR-L30a).
  const [confirmLeave, setConfirmLeave] = useState<'stop' | 'home' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const [crumple, setCrumple] = useState<Crumple | null>(null);
  const clearCrumple = useCallback(() => setCrumple(null), []);

  // The summary celebrates once per session (FR-L32a), also across Back and a refresh.
  const [celebrated, setCelebrated] = useState(stored.celebrated ?? false);
  const markCelebrated = useCallback(() => setCelebrated(true), []);

  // Persist on every change; Stop and the end of the loop clear it (FR-L33).
  useEffect(() => {
    if (state.phase === 'stopped' || state.phase === 'finished') clearLoop();
    else saveLoop({ ...stored, state, celebrated });
    if (state.phase === 'stopped') navigate('/', { replace: true });
  }, [state, stored, navigate, celebrated]);

  // "Only N new cards in Home…" once, when the loop starts (FR-L8).
  const notice = (location.state as LoopStartNotice | null)?.insufficient;
  useEffect(() => {
    if (notice) toast.show({ message: notice });
  }, [notice, toast]);

  // After Don't know, Next receives focus (FR-L28).
  useEffect(() => {
    if (state.phase === 'revealed') nextRef.current?.focus();
  }, [state.phase, state.index, state.cycle]);

  const act = useCallback(
    (type: LoopActionType) => {
      if (!canDispatch(state, type)) return;
      const id = currentCardId(state);
      // On a card reached with Back the answer can change (FR-L29a); only changes reach the queue.
      const before = id === null ? null : answerOf(state, id);
      // Know · ask again is never recorded (FR-L27a): leaving a Know for it drops the Know.
      if ((type === 'DONT_KNOW' || type === 'KNOW_AGAIN') && id !== null && before === 'know')
        knownSink.onUnknow(id, cards.get(id)?.direction.target ?? '');
      if ((type === 'KNOW' || type === 'KNOW_AGAIN') && id !== null) {
        const mark = { id, cycle: state.cycle };
        if (type === 'KNOW' && before !== 'know')
          knownSink.onKnow(mark, cards.get(id)?.direction.target ?? '');
        // The known card crumples and flies into the "known" counter (PRD §9.4).
        const known = cards.get(id);
        const from = cardRef.current?.getBoundingClientRect();
        const to = counterRef.current?.getBoundingClientRect();
        if (known && from && to && motionAllowed()) {
          setCrumple({
            key: Date.now(),
            card: known,
            side: state.side,
            hintsShown: state.hintsShown,
            again: type === 'KNOW_AGAIN',
            rect: { top: from.top, left: from.left, width: from.width, height: from.height },
            dx: to.left + to.width / 2 - (from.left + from.width / 2),
            dy: to.top + to.height / 2 - (from.top + from.height / 2),
          });
        }
      }
      if (type === 'BACK') {
        const offCard = state.phase === 'cycleBreak' || state.phase === 'finished';
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
      if (type === 'FLIP') {
        setAnnouncement(
          state.side === 'front' ? strings.card.showingAnswer : strings.card.showingFront,
        );
      }
      if (type === 'DONT_KNOW' && state.side === 'front')
        setAnnouncement(strings.card.showingAnswer);
      if (type === 'TOGGLE_HINTS')
        setAnnouncement(state.hintsShown ? strings.card.hintsHidden : strings.card.hintsShown);
      // A new cycle after the celebration means the session will be completed anew: celebrate
      // (and fly the crown) again when it ends (FR-L32a).
      if (type === 'CONTINUE') setCelebrated(false);
      dispatch({ type });
    },
    [state, cards, knownSink],
  );

  const onShortcut = useCallback(
    (action: LoopActionType | 'ENTER') => {
      if (confirmLeave) return; // the "are you sure?" question is open
      if (action === 'KNOW_AGAIN' && stored.isGuest) return; // signed-in learners only (FR-L27a)
      if (action === 'ENTER') act(state.phase === 'cycleBreak' ? 'CONTINUE' : 'NEXT');
      else if (action === 'STOP') setConfirmLeave('stop');
      else act(action);
    },
    [act, state.phase, confirmLeave, stored.isGuest],
  );
  useLoopShortcuts(onShortcut);

  const progress = loopProgress(state);
  const id = currentCardId(state);
  const card = id === null ? undefined : cards.get(id);
  // The chip shows on a card that already had an answer when it came up (reached with Back).
  const shownAnswer = id !== null && state.phase === 'deciding' ? answerOf(state, id) : null;
  const swipeRef = useSwipe({
    canLeft: canDispatch(state, 'NEXT'),
    canRight: canDispatch(state, 'BACK'),
    onLeft: () => act('NEXT'),
    onRight: () => act('BACK'),
    enabled: !confirmLeave,
    animate: motionAllowed(),
  });

  const ghost = crumple ? (
    <CrumpleGhost key={crumple.key} crumple={crumple} onDone={clearCrumple} />
  ) : null;
  const [progressHead, progressKnown] = splitKnown(
    strings.loop.progress(
      progress.cycle,
      progress.cardNumber,
      progress.cycleSize,
      progress.knownCount,
    ),
  );

  if (state.phase === 'cycleBreak') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <CycleBreak
          cycle={state.cycle + 1}
          remaining={progress.remaining}
          onContinue={() => act('CONTINUE')}
          onBack={() => act('BACK')}
        />
        {ghost}
      </main>
    );
  }
  if (state.phase === 'finished') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <FinishedScreen
          stored={stored}
          summary={loopSummary(state)}
          onBack={() => act('BACK')}
          celebrate={!celebrated}
          onCelebrated={markCelebrated}
        />
        {ghost}
      </main>
    );
  }
  if (!card) return null;

  return (
    <main
      id="main"
      className="mx-auto flex h-dvh w-full max-w-[1100px] flex-col gap-5 px-4 pt-4 md:h-auto md:min-h-dvh md:gap-10 md:px-8 md:pt-8"
    >
      <header className="flex items-center justify-between gap-3">
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
              className={`inline-block ${crumple ? `count-pop ${crumple.again ? 'count-pop--again' : ''}` : ''}`}
            >
              {progressKnown}
            </span>
          </span>
        </p>
        <div className="flex items-center gap-2 md:gap-4">
          <ShortcutsMenu askAgain={!stored.isGuest} />
          <button
            type="button"
            onClick={() => setConfirmLeave('home')}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2 text-sm text-muted hover:text-text md:text-base"
          >
            <span aria-hidden="true">←</span> {strings.nav.home}
          </button>
        </div>
        {confirmLeave && (
          <ConfirmDialog
            title={
              confirmLeave === 'home'
                ? strings.loop.homeConfirmTitle
                : strings.loop.stopConfirmTitle
            }
            body={strings.loop.homeConfirmBody}
            confirmLabel={strings.loop.yes}
            cancelLabel={strings.loop.no}
            onConfirm={() => {
              setConfirmLeave(null);
              act('STOP');
            }}
            onCancel={() => setConfirmLeave(null)}
          />
        )}
      </header>

      <div
        key={`${state.cycle}-${state.index}`}
        ref={cardRef}
        className="card-enter flex min-h-0 flex-1 flex-col md:h-[clamp(420px,58vh,600px)] md:flex-none"
      >
        {/* The swipe moves this inner box: the rise-in animation owns the outer one's transform.
            Vertical drags stay with the page (touch-action: pan-y). */}
        <div ref={swipeRef} className="flex min-h-0 flex-1 touch-pan-y flex-col">
          <FlipCard
            card={card}
            side={state.side}
            hintsShown={state.hintsShown}
            onFlip={() => act('FLIP')}
            answer={shownAnswer}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-4 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-4 pb-4 md:relative md:mx-0 md:bg-none md:px-0 md:pt-0 md:pb-8">
        <ButtonBar
          state={state}
          onAction={(type) => (type === 'STOP' ? setConfirmLeave('stop') : act(type))}
          nextRef={nextRef}
          askAgain={!stored.isGuest}
        />
      </div>
      {ghost}
    </main>
  );
}

/** "Cycle 1 · Card 2/5 · 1 known" → ["Cycle 1 · Card 2/5 · ", "1 known"]: the counter is the target. */
function splitKnown(text: string): [string, string] {
  const at = text.lastIndexOf(' · ') + 3;
  return [text.slice(0, at), text.slice(at)];
}

/** The crumple is skipped for "reduce motion" (and where it can't be detected, e.g. tests). */
function motionAllowed(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

type FinishedProps = {
  stored: StoredLoop;
  summary: ReturnType<typeof loopSummary>;
  onBack: () => void;
  celebrate: boolean;
  onCelebrated: () => void;
};

/**
 * The summary (FR-L32). "New session" starts the next loop with the same choices right away; it
 * waits while the start settings (/api/meta) load, and if they can't load it falls back to the
 * start card, pre-filled. One Summary throughout, so the celebration never restarts.
 */
function FinishedScreen({ stored, ...rest }: FinishedProps) {
  const meta = useQuery(META_QUERY);
  const navigate = useNavigate();
  const session = useSession();
  // The signed-in state now, not when the loop started (a guest may have signed in since).
  const isGuest = session.loading ? stored.isGuest : session.isGuest;
  const { start, starting, error, setError, containerRef } = useStartLoop({
    meta: meta.data,
    isGuest,
  });
  const newLoop = () => {
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
      onNewLoop={newLoop}
      newLoopDisabled={meta.isPending}
      starting={starting}
      startingLabel={isGuest ? strings.setup.botCheck : strings.setup.starting}
      error={error}
      turnstileRef={containerRef}
    />
  );
}
