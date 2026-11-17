import { canDispatch, type LoopActionType, type LoopState } from '@myvocab/core';
import type { Ref } from 'react';
import { Button3D } from '../../components/Button3D';
import { strings } from '../../strings';

/**
 * Loop buttons (PRD FR-L24, §9.7). One set of buttons, placed by CSS grid areas:
 * mobile: [Don't know · Flip · Know] / [Hints · Next] (Stop is in the header);
 * desktop: Stop | Don't know | Hints | Flip | Know | Next.
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
    <div
      className={[
        'grid gap-x-2 gap-y-4 pb-2',
        "grid-cols-[1fr_1fr_1.3fr] [grid-template-areas:'dk_flip_know'_'hints_next_next']",
        "md:grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] md:[grid-template-areas:'stop_dk_hints_flip_know_next']",
      ].join(' ')}
    >
      <Button3D variant="stop" className="hidden [grid-area:stop] md:inline-flex" {...btn('STOP')}>
        {strings.loop.stop}
      </Button3D>
      <Button3D variant="dontknow" className="[grid-area:dk]" {...btn('DONT_KNOW')}>
        {strings.loop.dontKnow}
      </Button3D>
      <Button3D variant="hint" className="[grid-area:hints]" {...btn('SHOW_HINTS')}>
        {strings.loop.hints}
      </Button3D>
      <Button3D variant="flip" className="[grid-area:flip]" {...btn('FLIP')}>
        {strings.loop.flip}
      </Button3D>
      <Button3D variant="know" className="[grid-area:know]" {...btn('KNOW')}>
        {strings.loop.know}
      </Button3D>
      <Button3D ref={nextRef} className="[grid-area:next]" {...btn('NEXT')}>
        {strings.loop.next}
      </Button3D>
    </div>
  );
}
