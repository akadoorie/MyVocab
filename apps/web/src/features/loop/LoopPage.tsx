import {
  canDispatch,
  currentCardId,
  loopProgress,
  loopReducer,
  loopSummary,
  undoBarLabel,
  type KnownMark,
  type LoopActionType,
} from '@myvocab/core';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { strings } from '../../strings';
import { useKnownQueue } from '../known/KnownQueueProvider';
import type { LoopStartNotice } from '../setup/StartCard';
import { LogoMark } from '../../components/Icons';
import { ButtonBar } from './ButtonBar';
import { FlipCard } from './FlipCard';
import { clearLoop, loadLoop, saveLoop, type StoredLoop } from './loop-storage';
import { CycleBreak, ShortcutsMenu, Summary, UndoBar } from './LoopScreens';
import { useLoopShortcuts } from './useLoopShortcuts';

export type KnownSink = {
  /** A Know was made (signed-in learners queue it, PRD §6.4). */
  onKnow(mark: KnownMark, target: string): void;
  /** That Know was undone. */
  onUndo(mark: KnownMark): void;
};

const noopSink: KnownSink = { onKnow: () => undefined, onUndo: () => undefined };

/**
 * The loop screen. Signed-in learners' Know marks go to the Know queue (PRD §6.4); guests' marks
 * go nowhere (FR-L55). `knownSink` overrides the queue (tests).
 */
export function LoopPage({ knownSink }: { knownSink?: KnownSink }) {
  const [stored] = useState<StoredLoop | null>(() => loadLoop());
  const queue = useKnownQueue();
  const sink = useMemo<KnownSink>(() => {
    if (knownSink) return knownSink;
    if (!queue || !stored || stored.isGuest) return noopSink;
    const undoMs = stored.undoWindowSeconds * 1000;
    return {
      onKnow: (mark, target) => queue.add({ itemId: mark.id, target, cycle: mark.cycle }, undoMs),
      onUndo: (mark) => queue.undo(mark.id),
    };
  }, [knownSink, queue, stored]);

  // Leaving the loop screen ends every undo window: pending marks become final.
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
  const [expired, setExpired] = useState<KnownMark | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [confirmHome, setConfirmHome] = useState(false);

  // Persist on every change; Stop and the end of the loop clear it (FR-L33).
  useEffect(() => {
    if (state.phase === 'stopped' || state.phase === 'finished') clearLoop();
    else saveLoop({ ...stored, state });
    if (state.phase === 'stopped') navigate('/', { replace: true });
  }, [state, stored, navigate]);

  // "Only N new cards in Home…" once, when the loop starts (FR-L8).
  const notice = (location.state as LoopStartNotice | null)?.insufficient;
  useEffect(() => {
    if (notice) toast.show({ message: notice });
  }, [notice, toast]);

  // The Undo bar shows for undo.windowSeconds after each Know (FR-L27).
  useEffect(() => {
    const mark = state.lastKnow;
    if (!mark) return;
    const id = window.setTimeout(() => setExpired(mark), stored.undoWindowSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [state.lastKnow, stored.undoWindowSeconds]);
  const undoVisible = state.lastKnow !== null && expired !== state.lastKnow;

  // After Don't know, Next receives focus (FR-L28).
  useEffect(() => {
    if (state.phase === 'revealed') nextRef.current?.focus();
  }, [state.phase, state.index, state.cycle]);

  const act = useCallback(
    (type: LoopActionType) => {
      if (!canDispatch(state, type)) return;
      const id = currentCardId(state);
      if (type === 'KNOW' && id !== null) {
        const mark = { id, cycle: state.cycle };
        knownSink.onKnow(mark, cards.get(id)?.direction.target ?? '');
      }
      if (type === 'UNDO_KNOW' && state.lastKnow) knownSink.onUndo(state.lastKnow);
      if (type === 'FLIP') {
        setAnnouncement(
          state.side === 'front' ? strings.card.showingAnswer : strings.card.showingFront,
        );
      }
      if (type === 'DONT_KNOW' && state.side === 'front')
        setAnnouncement(strings.card.showingAnswer);
      if (type === 'SHOW_HINTS') setAnnouncement(strings.card.hintsShown);
      dispatch({ type });
    },
    [state, cards, knownSink],
  );

  const onShortcut = useCallback(
    (action: LoopActionType | 'ENTER') => {
      if (confirmHome) return; // the "back home" question is open
      if (action === 'ENTER') act(state.phase === 'cycleBreak' ? 'CONTINUE' : 'NEXT');
      else act(action);
    },
    [act, state.phase, confirmHome],
  );
  useLoopShortcuts(onShortcut);

  const progress = loopProgress(state);
  const id = currentCardId(state);
  const card = id === null ? undefined : cards.get(id);
  const lastKnownCard = state.lastKnow ? cards.get(state.lastKnow.id) : undefined;

  const undoBar =
    undoVisible && lastKnownCard ? (
      <UndoBar label={undoBarLabel(lastKnownCard)} onUndo={() => act('UNDO_KNOW')} />
    ) : null;

  if (state.phase === 'cycleBreak') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <CycleBreak
          cycle={state.cycle + 1}
          remaining={progress.remaining}
          onContinue={() => act('CONTINUE')}
        />
        <div className="sticky bottom-4">{undoBar}</div>
      </main>
    );
  }
  if (state.phase === 'finished') {
    return (
      <main id="main" className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col px-4 py-6">
        <Summary
          summary={loopSummary(state)}
          isGuest={stored.isGuest}
          onHome={() => navigate('/')}
          onNewLoop={() => navigate('/', { state: { selection: stored.selection } })}
        />
        <div className="sticky bottom-4">{undoBar}</div>
      </main>
    );
  }
  if (!card) return null;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col gap-5 px-4 pt-4 md:gap-10 md:px-8 md:pt-8"
    >
      <header className="flex items-center justify-between gap-3">
        <p
          className="flex items-center gap-3 text-base font-medium md:text-xl"
          data-testid="progress"
        >
          <LogoMark className="h-8 w-8 shrink-0 md:h-10 md:w-10" />
          <span>
            {strings.loop.progress(
              progress.cycle,
              progress.cardNumber,
              progress.cycleSize,
              progress.knownCount,
            )}
          </span>
        </p>
        <div className="flex items-center gap-2 md:gap-4">
          <ShortcutsMenu />
          <button
            type="button"
            onClick={() => setConfirmHome(true)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2 text-sm text-muted hover:text-text md:text-base"
          >
            <span aria-hidden="true">←</span> {strings.nav.home}
          </button>
        </div>
        {confirmHome && (
          <ConfirmDialog
            title={strings.loop.homeConfirmTitle}
            body={strings.loop.homeConfirmBody}
            confirmLabel={strings.loop.yes}
            cancelLabel={strings.loop.no}
            onConfirm={() => {
              setConfirmHome(false);
              act('STOP');
            }}
            onCancel={() => setConfirmHome(false)}
          />
        )}
      </header>

      <div
        key={`${state.cycle}-${state.index}`}
        className="card-enter flex flex-1 flex-col md:flex-none"
      >
        <FlipCard
          card={card}
          side={state.side}
          hintsShown={state.hintsShown}
          onFlip={() => act('FLIP')}
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-4 bg-gradient-to-t from-bg via-bg to-transparent px-4 pt-4 pb-4 md:static md:mx-0 md:bg-none md:px-0 md:pt-0 md:pb-8">
        {undoBar}
        <ButtonBar state={state} onAction={act} nextRef={nextRef} />
      </div>
    </main>
  );
}
