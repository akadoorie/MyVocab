import { canDispatch, type LoopActionType, type LoopState } from '@myvocab/core';
import type { MouseEvent, ReactNode, Ref } from 'react';
import {
  BulbIcon,
  CheckIcon,
  ChevronBackIcon,
  ChevronIcon,
  CrossIcon,
  StopIcon,
} from '../../components/Icons';
import { strings } from '../../strings';

type Kind = 'round' | 'hint' | 'know' | 'again' | 'dontknow' | 'next';

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
  ref,
  ...rest
}: {
  kind: Kind;
  icon: ReactNode;
  label: string;
  /** A small caption under a pill ("forever" / "ask again", FR-L27a). */
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
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  const shape = kind === 'round' || kind === 'hint' ? 'lbtn--round' : 'lbtn--pill';
  return (
    <button
      ref={ref}
      type="button"
      className={`lbtn ${shape} lbtn--${kind} ${caption ? 'has-caption' : ''} ${pressed ? 'is-pressed' : ''} ${className}`}
      aria-pressed={pressed}
      aria-label={name}
      {...rest}
    >
      <span className="lbtn__shape" aria-hidden="true" />
      <span className="lbtn__icon">{icon}</span>
      <span className={hideLabel ? 'sr-only' : 'lbtn__label'}>{label}</span>
      {caption && (
        <span className="lbtn__caption" aria-hidden="true">
          {caption}
        </span>
      )}
    </button>
  );
}

/**
 * Loop buttons (PRD FR-L24, §9.7). Desktop: one row `Stop · Hints · Back · Know · Don't know · Next`.
 * Phones: the wide Know / Don't know pills on top, `Stop · Hints · Back · Next` below. After Don't
 * know, one wide Next pill takes the place of Know / Don't know. Flip is on the card.
 * With `askAgain` (signed-in learners, FR-L27a) the amber "Know · ask again" pill sits between
 * Know and Don't know, and the two Knows get their "forever" / "ask again" captions.
 */
export function ButtonBar({
  state,
  onAction,
  nextRef,
  askAgain = false,
}: {
  state: LoopState;
  onAction: (type: LoopActionType) => void;
  nextRef: Ref<HTMLButtonElement>;
  askAgain?: boolean;
}) {
  const btn = (type: LoopActionType) => ({
    disabled: !canDispatch(state, type),
    onClick: () => onAction(type),
  });
  // Revealed (after Don't know): Know and Don't know are off, so their place becomes one wide
  // Next pill, the only way on (PRD FR-L28, §9.7).
  // (On an earlier card reached with Back, Next is allowed too, but Know / Don't know stay.)
  const revealed = state.phase === 'revealed';
  // Three pills on a phone carry their label only (base.css).
  const trio = askAgain ? 'lbtn--trio' : '';
  return (
    <div
      className={[
        'grid items-start gap-x-3 gap-y-5 pb-1',
        revealed
          ? "grid-cols-6 [grid-template-areas:'pills_pills_pills_pills_pills_pills'_'stop_stop_hints_hints_back_back']"
          : askAgain
            ? "grid-cols-12 [grid-template-areas:'know_know_know_know_again_again_again_again_dk_dk_dk_dk'_'stop_stop_stop_hints_hints_hints_back_back_back_next_next_next']"
            : "grid-cols-8 [grid-template-areas:'know_know_know_know_dk_dk_dk_dk'_'stop_stop_hints_hints_back_back_next_next']",
        revealed
          ? "md:grid-cols-[auto_auto_auto_1fr] md:gap-x-6 md:[grid-template-areas:'stop_hints_back_pills']"
          : askAgain
            ? "md:grid-cols-[auto_auto_auto_1fr_1fr_1.1fr_auto] md:gap-x-6 md:[grid-template-areas:'stop_hints_back_know_again_dk_next']"
            : "md:grid-cols-[auto_auto_auto_1fr_1.2fr_auto] md:gap-x-6 md:[grid-template-areas:'stop_hints_back_know_dk_next']",
      ].join(' ')}
    >
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
      {revealed ? (
        <LoopButton
          ref={nextRef}
          kind="next"
          className="[grid-area:pills]"
          icon={<ChevronIcon />}
          label={strings.loop.next}
          {...btn('NEXT')}
        />
      ) : (
        <>
          <LoopButton
            kind="know"
            icon={<CheckIcon />}
            label={strings.loop.know}
            className={`[grid-area:know] ${trio}`}
            {...(askAgain
              ? { caption: strings.loop.knowForever, name: strings.loop.knowForeverName }
              : {})}
            {...btn('KNOW')}
          />
          {askAgain && (
            <LoopButton
              kind="again"
              icon={<CheckIcon />}
              label={strings.loop.know}
              caption={strings.loop.knowAskAgain}
              name={strings.loop.knowAskAgainName}
              className={`[grid-area:again] ${trio}`}
              {...btn('KNOW_AGAIN')}
            />
          )}
          <LoopButton
            kind="dontknow"
            className={`[grid-area:dk] ${trio}`}
            icon={<CrossIcon />}
            label={strings.loop.dontKnow}
            {...btn('DONT_KNOW')}
          />
          <LoopButton
            kind="round"
            className="[grid-area:next]"
            icon={<ChevronIcon />}
            label={strings.loop.next}
            {...btn('NEXT')}
          />
        </>
      )}
    </div>
  );
}
