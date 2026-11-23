import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Segmented } from './Field';

afterEach(() => vi.restoreAllMocks());

const OPTIONS = [10, 20, 30, 40, 50].map((n) => ({ value: n, label: String(n), disabled: n > 40 }));

function Amount({ start = 20 }: { start?: number }) {
  const [value, setValue] = useState(start);
  return (
    <Segmented
      id="amount"
      label="Cards per practice"
      isDefault
      value={value}
      onChange={setValue}
      options={OPTIONS}
    />
  );
}

const radio = (n: number) => screen.getByRole('radio', { name: String(n) });
const checked = () =>
  screen.getAllByRole('radio').find((r) => r.getAttribute('aria-checked') === 'true');

/** jsdom has no layout: each option is 60px wide, side by side from x = 0. */
function layout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const i = [...(this.parentElement?.children ?? [])]
      .filter((c) => c.getAttribute('role') === 'radio')
      .indexOf(this);
    const left = i >= 0 ? i * 60 : 0;
    return {
      left,
      right: left + 60,
      width: 60,
      top: 0,
      bottom: 40,
      height: 40,
      x: left,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
}

describe('Cards per practice: the sliding pill (D-098)', () => {
  it('a tap on an amount chooses it', () => {
    render(<Amount />);
    fireEvent.click(radio(30));
    expect(checked()).toBe(radio(30));
  });

  it('a sideways drag moves the pill to the amount under the finger, and skips disabled ones', () => {
    layout();
    render(<Amount />);
    const group = screen.getByRole('radiogroup', { name: 'Cards per practice' });
    fireEvent.pointerDown(group, { pointerId: 1, clientX: 90, pointerType: 'touch' });
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 150, pointerType: 'touch' }); // over 30
    expect(checked()).toBe(radio(30));
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 270, pointerType: 'touch' }); // over 50: disabled
    expect(checked()).toBe(radio(40));
    fireEvent.pointerUp(group, { pointerId: 1 });
    // The click that follows the drag on the button under the finger is ignored.
    fireEvent.click(radio(10));
    expect(checked()).toBe(radio(40));
    fireEvent.click(radio(10));
    expect(checked()).toBe(radio(10));
  });

  it('after a drag with no click after it, the next tap still works', () => {
    layout();
    render(<Amount />);
    const group = screen.getByRole('radiogroup');
    fireEvent.pointerDown(group, { pointerId: 1, clientX: 90 });
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(group, { pointerId: 1 });
    expect(checked()).toBe(radio(30));
    // A new tap: press, release, click.
    fireEvent.pointerDown(radio(10), { pointerId: 2, clientX: 30 });
    fireEvent.pointerUp(radio(10), { pointerId: 2 });
    fireEvent.click(radio(10));
    expect(checked()).toBe(radio(10));
  });

  it('a small wobble is not a drag', () => {
    layout();
    render(<Amount />);
    const group = screen.getByRole('radiogroup');
    fireEvent.pointerDown(group, { pointerId: 1, clientX: 90 });
    fireEvent.pointerMove(group, { pointerId: 1, clientX: 95 });
    expect(checked()).toBe(radio(20));
  });

  it('the arrow keys step through the enabled amounts', () => {
    render(<Amount start={30} />);
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(checked()).toBe(radio(40));
    fireEvent.keyDown(group, { key: 'ArrowRight' }); // 50 is disabled
    expect(checked()).toBe(radio(40));
    fireEvent.keyDown(group, { key: 'Home' });
    expect(checked()).toBe(radio(10));
    expect(document.activeElement).toBe(radio(10));
  });
});
