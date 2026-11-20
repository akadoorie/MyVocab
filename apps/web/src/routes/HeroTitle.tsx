import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The slogan's look: a white-to-violet gradient clipped to the text (PRD §9.7). */
// No kerning: the animated words are separate boxes, so the plain heading must match them.
const BASE =
  'text-3xl leading-tight font-bold tracking-tight text-balance [font-kerning:none] md:text-5xl';
const GRADIENT = 'bg-gradient-to-br from-text to-[#b9a6ff] bg-clip-text text-transparent';
/** The tries end at 2.25s and the shine at 2.95s; swap to plain text just after. */
const TRIES_MS = 3000;

/** Played already since the page loaded (in memory only, so a refresh plays it again). */
let shown = false;

function motionOK(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

type Mode = 'tries' | 'fade' | 'still';

/**
 * The home page slogan (D-037). When the page loads (or is refreshed) on Home, the first words
 * fade in and the last word drops in, bounces off twice and sticks on the third try with a soft
 * squash, then a faint shine runs across it: "until they stick". Coming back to Home inside the
 * app shows it in place. Reduced motion: a short fade. Each animated word carries its own slice
 * of the gradient, so the end matches the plain slogan, which then replaces the words.
 */
export function HeroTitle({ text }: { text: string }) {
  const [mode] = useState<Mode>(() => (shown ? 'still' : motionOK() ? 'tries' : 'fade'));
  const [done, setDone] = useState(mode !== 'tries');
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    shown = true;
    if (mode !== 'tries') return;
    const timer = window.setTimeout(() => setDone(true), TRIES_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  // Give each word the part of the slogan-wide gradient that lies under it.
  useLayoutEffect(() => {
    const h1 = ref.current;
    if (done || !h1) return;
    h1.style.setProperty('--w', `${h1.clientWidth}px`);
    h1.style.setProperty('--h', `${h1.clientHeight}px`);
    for (const el of h1.querySelectorAll<HTMLElement>('.slogan-word')) {
      el.style.setProperty('--x', `${-el.offsetLeft}px`);
      el.style.setProperty('--y', `${-el.offsetTop}px`);
    }
  }, [done]);

  if (done) {
    return (
      <h1 className={`${BASE} ${GRADIENT} ${mode === 'fade' ? 'slogan-fade' : ''}`}>{text}</h1>
    );
  }
  const words = text.split(' ');
  const last = words.length - 1;
  return (
    <h1 ref={ref} className={`${BASE} relative`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <span key={w}>
            {w > 0 && ' '}
            {w < last ? (
              <span className="slogan-word slogan-rest">{word}</span>
            ) : (
              <span className="slogan-word slogan-stick">
                {word}
                <span className="slogan-shine">{word}</span>
              </span>
            )}
          </span>
        ))}
      </span>
    </h1>
  );
}
