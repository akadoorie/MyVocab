import { canDispatch, type LoopActionType, type LoopState } from '@myvocab/core';
import type { MouseEvent, ReactNode, Ref } from 'react';
import {
  BulbIcon,
  CheckIcon,
  LockIcon,
  ChevronBackIcon,
  ChevronIcon,
  CrossIcon,
  StopIcon,
} from '../../components/Icons';
import { strings } from '../../strings';

type Kind = 'round' | 'hint' | 'know' | 'again' | 'dontknow';

/** A loop button: a 3D circle or pill with an icon, and its caption (PRD §9.2). */
export function LoopButton({
  kind,
  icon,
  label,
  caption,
  name,
  className = '',
  hideLabel = false,
  pressed,
  locked = false,
  ref,
  ...rest
}: {
  kind: Kind;
  icon: ReactNode;
  label: string;
  /** A small caption under a pill (what the answer does, FR-L27a, D-030). */
  caption?: string;
  /** The accessible name, when it differs from the visible label + caption. */
  name?: string;
  className?: string;
  /** Keep the name for screen readers but show only the icon. */
  hideLabel?: boolean;
  ref?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  /** A toggle button's state (Hints): announced and styled as pressed. */
  pressed?: boolean;
  /** Shown but not available (the green Know for guests, D-042): dimmed, with a lock. */
  locked?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  const shape = kind === 'round' || kind === 'hint' ? 'lbtn--round' : 'lbtn--pill';
  return (
    <button
      ref={ref}
      type="button"
      className={`lbtn ${shape} lbtn--${kind} ${caption ? 'has-caption' : ''} ${pressed ? 'is-pressed' : ''} ${locked ? 'is-locked' : ''} ${className}`}
      aria-pressed={pressed}
      aria-label={name}
      {...rest}
    >
      <span className="lbtn__shape" aria-hidden="true" />
      <span className="lbtn__icon">{icon}</span>
      <span className={hideLabel ? 'sr-only' : 'lbtn__label'}>{label}</span>
      {locked && (
        // A yellow lock on the top-left edge: visible on phones too, where the pills hide icons.
        <span className="lock-badge lbtn__lock" aria-hidden="true">
          <LockIcon />
        </span>
      )}
      {/* A space, so the visible text reads "I know it Don't show again", not "itDon't" (axe). */}
      {caption && ' '}
      {caption && (
        <span className="lbtn__caption" aria-hidden="true">
          {caption}
        </span>
      )}
    </button>
  );
}

/**
 * Loop buttons (PRD FR-L24, §9.7). Desktop: one row `Stop · Hints · Back · three answers · Next`.
 * Phones: the three answer pills on top, `Stop · Hints · Back · Next` below. After "I don't know"
 * the layout stays: the answers are off and Next pumps (D-031). Flip is on the card.
 * The answers (D-030): green "I know it · Don't show again", orange "I know it · Show again in
 * future" (FR-L27a) and red "I don't know · Show again soon". Guests (`signedIn` false) see the
 * green one locked: nothing is kept for them, so "Don't show again" needs signing in, while the
 * orange one does for them exactly what it says (D-042).
 */
export function ButtonBar({
  state,
  onAction,
  nextRef,
  signedIn = false,
}: {
  state: LoopState;
  onAction: (type: LoopActionType) => void;
  nextRef: Ref<HTMLButtonElement>;
  signedIn?: boolean;
}) {
  const btn = (type: LoopActionType) => ({
    disabled: !canDispatch(state, type),
    onClick: () => onAction(type),
  });
  // Revealed (after Don't know): the layout stays; the answers are off and Next pumps, the only
  // way on (PRD FR-L28, §9.7, D-031).
  // (On an earlier card reached with Back, Next is allowed too, but without the pumping.)
  const revealed = state.phase === 'revealed';
  // Three pills on a phone carry their label only (base.css).
  const trio = 'lbtn--trio';
  return (
    <div className="grid grid-cols-12 items-start gap-x-3 gap-y-5 pb-1 [grid-template-areas:'know_know_know_know_again_again_again_again_dk_dk_dk_dk'_'stop_stop_stop_hints_hints_hints_back_back_back_next_next_next'] md:grid-cols-[auto_auto_auto_1fr_1fr_1.1fr_auto] md:gap-x-6 md:[grid-template-areas:'stop_hints_back_know_again_dk_next']">
      <LoopButton
        kind="round"
        icon={<StopIcon />}
        label={strings.loop.stop}
        className="[grid-area:stop]"
        {...btn('STOP')}
      />
      <LoopButton
        kind="hint"
        className="[grid-area:hints]"
        icon={<BulbIcon />}
        label={strings.loop.hints}
        pressed={state.hintsShown && state.side === 'front'}
        {...btn('TOGGLE_HINTS')}
      />
      <LoopButton
        kind="round"
        className="[grid-area:back]"
        icon={<ChevronBackIcon />}
        label={strings.loop.back}
        {...btn('BACK')}
      />
      {signedIn ? (
        <LoopButton
          kind="know"
          icon={<CheckIcon />}
          label={strings.loop.know}
          caption={strings.loop.knowCaption}
          name={strings.loop.knowName}
          className={`[grid-area:know] ${trio}`}
          {...btn('KNOW')}
        />
      ) : (
        // Guests see what signing in adds: the same button, locked (D-042).
        <LoopButton
          kind="know"
          icon={<CheckIcon />}
          label={strings.loop.know}
          caption={strings.loop.knowCaption}
          name={strings.loop.knowNameGuest}
          title={strings.loop.signInToEnable}
          className={`[grid-area:know] ${trio}`}
          locked
          disabled
        />
      )}
      <LoopButton
        kind="again"
        icon={<CheckIcon />}
        label={strings.loop.know}
        caption={strings.loop.againCaption}
        name={strings.loop.againName}
        className={`[grid-area:again] ${trio}`}
        {...btn('KNOW_AGAIN')}
      />
      <LoopButton
        kind="dontknow"
        className={`[grid-area:dk] ${trio}`}
        icon={<CrossIcon />}
        label={strings.loop.dontKnow}
        caption={strings.loop.dontKnowCaption}
        name={strings.loop.dontKnowName}
        {...btn('DONT_KNOW')}
      />
      <LoopButton
        ref={nextRef}
        kind="round"
        className={`[grid-area:next] ${revealed ? 'is-urgent' : ''}`}
        icon={<ChevronIcon />}
        label={strings.loop.next}
        {...btn('NEXT')}
      />
    </div>
  );
}
