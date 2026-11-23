import { canDispatch, type PracticeActionType, type PracticeState } from '@myvocab/core';
import type { CSSProperties, MouseEvent, ReactNode, Ref } from 'react';
import { LockIcon, ChevronBackIcon, ChevronIcon } from '../../components/Icons';
import { strings } from '../../strings';

type Kind = 'round' | 'hint' | 'know' | 'again' | 'dontknow';

/** A practice button: a 3D circle or pill with an icon, and its caption (PRD §9.2). */
export function PracticeButton({
  kind,
  icon,
  label,
  caption,
  name,
  className = '',
  hideLabel = false,
  pressed,
  locked = false,
  labelExtra,
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
  style?: CSSProperties;
  /** Shown after the label but not read out, e.g. Next's countdown " · 7" (D-069). */
  labelExtra?: string;
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
      <span className={hideLabel ? 'sr-only' : 'lbtn__label'}>
        {label}
        {labelExtra && <span aria-hidden="true">{labelExtra}</span>}
      </span>
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
 * Practice buttons (PRD FR-L24, §9.7). Desktop: one row `Back · three answers · Next`.
 * Phones: the three answer pills on top, Back (left) and Next (right) below. No Stop: Home in the
 * header (or Esc) ends the practice (D-072). Hints are on the card, under a
 * live cover (D-047). After "I don't know"
 * the layout stays: the answers are off and Next pumps (D-031). On a card answered earlier (reached
 * with Back), Next keeps pumping and shines with the answers' nudge: it is the way on (D-084).
 * Flip is on the card.
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
  nudging = null,
  nextCountdown = null,
}: {
  state: PracticeState;
  onAction: (type: PracticeActionType) => void;
  nextRef: Ref<HTMLButtonElement>;
  signedIn?: boolean;
  /** A guest tapped the locked green button: say why (D-043). */
  onLocked?: () => void;
  /** Show "Sign-in required" over the locked green button (for 1.5 seconds, D-043). */
  lockedTip?: boolean;
  onSignIn?: () => void;
  /** Pump once and shine, to show what to press (D-066); disabled buttons stay still. */
  nudging?: 'full' | 'shine' | null;
  /** After "I don't know", Next counts down and then moves on by itself (D-069). */
  nextCountdown?: { left: number; running: boolean; seconds: number } | null;
}) {
  const btn = (type: PracticeActionType) => ({
    disabled: !canDispatch(state, type),
    onClick: () => onAction(type),
  });
  // Revealed (after Don't know): the layout stays; the answers are off and Next pumps, the only
  // way on (PRD FR-L28, §9.7, D-031).
  const revealed = state.phase === 'revealed';
  // A card answered earlier, reached with Back (FR-L29a): changing the answer is optional, so Next,
  // the way on, keeps pumping (in its own colours) and shines after the red pill (D-084).
  const onEarlierCard = state.phase === 'deciding' && canDispatch(state, 'NEXT');
  // The three answer pills carry their label only, on every screen (D-058, base.css).
  const trio = 'lbtn--trio';
  // Green, orange, red one after the other (base.css: nudge-1..3).
  const nudge = (n: number) =>
    nudging ? `${nudging === 'full' ? 'is-nudging' : 'is-shining'} nudge-${n}` : '';
  return (
    <div className="grid grid-cols-12 items-start gap-x-3 gap-y-3.5 pb-1 [grid-template-areas:'know_know_know_know_again_again_again_again_dk_dk_dk_dk'_'back_back_back_back_._._._._next_next_next_next'] md:grid-cols-[auto_1fr_1fr_1.1fr_auto] md:gap-x-6 md:[grid-template-areas:'back_know_again_dk_next']">
      <PracticeButton
        kind="round"
        className="[grid-area:back] edge-start"
        icon={<ChevronBackIcon />}
        label={strings.practice.back}
        {...btn('BACK')}
      />
      {signedIn ? (
        <PracticeButton
          kind="know"
          icon={null}
          label={strings.practice.know}
          caption={strings.practice.knowCaption}
          name={strings.practice.knowName}
          className={`[grid-area:know] ${trio} ${nudge(1)}`}
          {...btn('KNOW')}
        />
      ) : (
        // Guests see what signing in adds: the same button, locked (D-042).
        <PracticeButton
          kind="know"
          icon={null}
          label={strings.practice.know}
          caption={strings.practice.knowCaption}
          name={strings.practice.knowNameGuest}
          title={strings.practice.signInToEnable}
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
            {/* Text around the link, in either order: "Sign-in required" / "נדרשת התחברות". */}
            {/* The spaces are for screen readers; the flex gap spaces the words on screen. */}
            {strings.practice.lockedTipBefore && <span>{strings.practice.lockedTipBefore} </span>}
            <button
              type="button"
              onClick={onSignIn}
              className="font-semibold text-accent underline underline-offset-2 hover:text-text"
            >
              {strings.practice.lockedTipLink}
            </button>
            {strings.practice.lockedTip && <span> {strings.practice.lockedTip}</span>}
          </p>
        )}
      </div>
      <PracticeButton
        kind="again"
        icon={null}
        label={strings.practice.know}
        caption={strings.practice.againCaption}
        name={strings.practice.againName}
        className={`[grid-area:again] ${trio} ${nudge(2)}`}
        {...btn('KNOW_AGAIN')}
      />
      <PracticeButton
        kind="dontknow"
        className={`[grid-area:dk] ${trio} ${nudge(3)}`}
        icon={null}
        label={strings.practice.dontKnow}
        caption={strings.practice.dontKnowCaption}
        name={strings.practice.dontKnowName}
        {...btn('DONT_KNOW')}
      />
      <PracticeButton
        ref={nextRef}
        kind="round"
        className={`[grid-area:next] edge-end ${revealed ? 'is-urgent' : ''} ${onEarlierCard ? `is-pumping ${nudge(4)}` : ''} ${nextCountdown ? `has-countdown ${nextCountdown.running ? '' : 'is-countdown-paused'}` : ''}`}
        {...(nextCountdown
          ? {
              labelExtra: ` · ${nextCountdown.left}`,
              style: { '--countdown-s': `${nextCountdown.seconds}s` } as CSSProperties,
            }
          : {})}
        icon={<ChevronIcon />}
        label={strings.practice.next}
        {...btn('NEXT')}
      />
    </div>
  );
}
