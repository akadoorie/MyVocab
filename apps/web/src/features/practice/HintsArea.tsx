import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The hints and synonyms in their own scrolling area (D-050): it takes the room left on the card
 * face and scrolls by itself when the hints are long, with a thin violet scrollbar and a soft
 * fade at its bottom edge while there is more below. The word above and the Flip button never
 * move. `locked` (under the cover) stops scrolling and hides the fade.
 */
export function HintsArea({
  children,
  locked = false,
  hidden = false,
}: {
  children: ReactNode;
  locked?: boolean;
  /** Hidden from screen readers (the covered hints, until revealed). */
  hidden?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={`hints-area ${locked ? 'is-locked' : ''} ${more && !locked ? 'has-more' : ''}`}>
      <div ref={scrollRef} className="hints-area__scroll" aria-hidden={hidden || undefined}>
        <div>{children}</div>
      </div>
    </div>
  );
}
