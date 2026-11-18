import { canDispatch, type LoopActionType, type LoopState } from '@myvocab/core';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { BulbIcon, CheckIcon, ChevronIcon, CrossIcon, StopIcon } from '../../components/Icons';
import { strings } from '../../strings';

type Kind = 'round' | 'hint' | 'know' | 'dontknow';

/** A loop button: a 3D circle or pill with an icon, and its caption (PRD §9.2). */
export function LoopButton({
  kind,
  icon,
  label,
  className = '',
  hideLabel = false,
  ref,
  ...rest
}: {
  kind: Kind;
  icon: ReactNode;
  label: string;
  className?: string;
  /** Keep the name for screen readers but show only the icon. */
  hideLabel?: boolean;
  ref?: Ref<HTMLButtonElement>;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  const shape = kind === 'know' || kind === 'dontknow' ? 'lbtn--pill' : 'lbtn--round';
  return (
    <button
      ref={ref}
      type="button"
      className={`lbtn ${shape} lbtn--${kind} ${className}`}
      {...rest}
    >
      <span className="lbtn__shape" aria-hidden="true" />
      <span className="lbtn__icon">{icon}</span>
      <span className={hideLabel ? 'sr-only' : 'lbtn__label'}>{label}</span>
    </button>
  );
}

/**
 * Loop buttons (PRD FR-L24, §9.7): one row `Stop · Hints · Know · Don't know · Next`. Flip is on
 * the card. On phones the pills show only their icon, with captions under every button.
 */
export function ButtonBar({
  state,
  onAction,
  nextRef,
}: {
  state: LoopState;
  onAction: (type: LoopActionType) => void;
  nextRef: Ref<HTMLButtonElement>;
}) {
  const btn = (type: LoopActionType) => ({
    disabled: !canDispatch(state, type),
    onClick: () => onAction(type),
  });
  return (
    <div className="grid grid-cols-[auto_auto_1fr_1fr_auto] items-start gap-x-3 pb-1 md:grid-cols-[auto_auto_1fr_1.2fr_auto] md:gap-x-6">
      <LoopButton kind="round" icon={<StopIcon />} label={strings.loop.stop} {...btn('STOP')} />
      <LoopButton
        kind="hint"
        icon={<BulbIcon />}
        label={strings.loop.hints}
        {...btn('SHOW_HINTS')}
      />
      <LoopButton kind="know" icon={<CheckIcon />} label={strings.loop.know} {...btn('KNOW')} />
      <LoopButton
        kind="dontknow"
        icon={<CrossIcon />}
        label={strings.loop.dontKnow}
        {...btn('DONT_KNOW')}
      />
      <LoopButton
        ref={nextRef}
        kind="round"
        icon={<ChevronIcon />}
        label={strings.loop.next}
        {...btn('NEXT')}
      />
    </div>
  );
}
