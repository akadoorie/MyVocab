import { canDispatch, type LoopActionType, type LoopState } from '@myvocab/core';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { LockIcon, ChevronBackIcon, ChevronIcon, StopIcon } from '../../components/Icons';
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
  /** Off but still focusable and clickable (the locked button explains itself, D-043). */
  'aria-disabled'?: boolean;
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
        // A yellow lock on the top-left edge (the answer pills have no icons, D-058).
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
 * Loop buttons (PRD FR-L24, §9.7). Desktop: one row `Stop · Back · three answers · Next`.
 * Phones: the three answer pills on top, `Stop · Back · Next` below. Hints are on the card, under a
 * live cover (D-047). After "I don't know"
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
  onLocked,
  lockedTip = false,
  onSignIn,
  nudging = false,
}: {
  state: LoopState;
  onAction: (type: LoopActionType) => void;
  nextRef: Ref<HTMLButtonElement>;
  signedIn?: boolean;
  /** A guest tapped the locked green button: say why (D-043). */
  onLocked?: () => void;
  /** Show "Sign-in required" over the locked green button (for 1.5 seconds, D-043). */
  lockedTip?: boolean;
  onSignIn?: () => void;
  /** Pump once and shine, to show what to press (D-066); disabled buttons stay still. */
  nudging?: boolean;
}) {
  const btn = (type: LoopActionType) => ({
    disabled: !canDispatch(state, type),
    onClick: () => onAction(type),
  });
  // Revealed (after Don't know): the layout stays; the answers are off and Next pumps, the only
  // way on (PRD FR-L28, §9.7, D-031).
  // (On an earlier card reached with Back, Next is allowed too, but without the pumping.)
  const revealed = state.phase === 'revealed';
  // The three answer pills carry their label only, on every screen (D-058, base.css).
  const trio = 'lbtn--trio';
  // Green, orange, red one after the other (base.css: nudge-1..3).
  const nudge = (n: number) => (nudging ? `is-nudging nudge-${n}` : '');
  return (
    <div className="grid grid-cols-12 items-start gap-x-3 gap-y-5 pb-1 [grid-template-areas:'know_know_know_know_again_again_again_again_dk_dk_dk_dk'_'stop_stop_stop_stop_back_back_back_back_next_next_next_next'] md:grid-cols-[auto_auto_1fr_1fr_1.1fr_auto] md:gap-x-6 md:[grid-template-areas:'stop_back_know_again_dk_next']">
      <LoopButton
        kind="round"
        icon={<StopIcon />}
        label={strings.loop.stop}
        className="[grid-area:stop]"
        {...btn('STOP')}
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
          icon={null}
          label={strings.loop.know}
          caption={strings.loop.knowCaption}
          name={strings.loop.knowName}
          className={`[grid-area:know] ${trio} ${nudge(1)}`}
          {...btn('KNOW')}
        />
      ) : (
        // Guests see what signing in adds: the same button, locked (D-042).
        <LoopButton
          kind="know"
          icon={null}
          label={strings.loop.know}
          caption={strings.loop.knowCaption}
          name={strings.loop.knowNameGuest}
          title={strings.loop.signInToEnable}
          className={`[grid-area:know] ${trio} ${nudge(1)}`}
          locked
          aria-disabled
          onClick={onLocked}
        />
      )}
      {/* Over the green pill, in the same grid cell; announced politely. */}
      <div aria-live="polite" className="pointer-events-none z-10 self-start [grid-area:know]">
        {!signedIn && lockedTip && (
          <p className="locked-tip pointer-events-auto">
            <button
              type="button"
              onClick={onSignIn}
              className="font-semibold text-accent underline underline-offset-2 hover:text-text"
            >
              {strings.nav.signInLink}
            </button>{' '}
            {strings.loop.lockedTip}
          </p>
        )}
      </div>
      <LoopButton
        kind="again"
        icon={null}
        label={strings.loop.know}
        caption={strings.loop.againCaption}
        name={strings.loop.againName}
        className={`[grid-area:again] ${trio} ${nudge(2)}`}
        {...btn('KNOW_AGAIN')}
      />
      <LoopButton
        kind="dontknow"
        className={`[grid-area:dk] ${trio} ${nudge(3)}`}
        icon={null}
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
