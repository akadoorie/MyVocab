import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** The slogan's look: a white-to-violet gradient clipped to the text (PRD §9.7). */
// No kerning: the falling letters are separate boxes, so the plain heading must match them.
const BASE =
  'text-3xl leading-tight font-bold tracking-tight text-balance [font-kerning:none] md:text-5xl';
const GRADIENT = 'bg-gradient-to-br from-text to-[#b9a6ff] bg-clip-text text-transparent';
/** The last letter starts at 0.9s and takes 0.7s; swap to plain text just after. */
const SNOW_MS = 1700;

/** Played already since the page loaded (in memory only, so a refresh plays it again). */
let shown = false;

function motionOK(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ?? false;
}

type Mode = 'snow' | 'fade' | 'still';

/**
 * The home page slogan (D-034). When the page loads (or is refreshed) on Home, its letters
 * fall in like snow: tiny soft specks that drift down, sharpen into letters and settle in a
 * scattered order, about 1.6s in all. Coming back to Home inside the app shows it in place. Reduced motion: a
 * short fade. Each falling letter carries its own slice of the gradient, so the end matches the
 * plain slogan, which then replaces the letters.
 */
export function HeroTitle({ text }: { text: string }) {
  const [mode] = useState<Mode>(() => (shown ? 'still' : motionOK() ? 'snow' : 'fade'));
  const [done, setDone] = useState(mode !== 'snow');
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    shown = true;
    if (mode !== 'snow') return;
    const timer = window.setTimeout(() => setDone(true), SNOW_MS);
    return () => window.clearTimeout(timer);
  }, [mode]);

  // Give each letter the part of the slogan-wide gradient that lies under it.
  useLayoutEffect(() => {
    const h1 = ref.current;
    if (done || !h1) return;
    h1.style.setProperty('--w', `${h1.clientWidth}px`);
    h1.style.setProperty('--h', `${h1.clientHeight}px`);
    for (const el of h1.querySelectorAll<HTMLElement>('.slogan-letter')) {
      el.style.setProperty('--x', `${-el.offsetLeft}px`);
      el.style.setProperty('--y', `${-el.offsetTop}px`);
    }
  }, [done]);

  const [letters] = useState(() => scatter(text));

  if (done) {
    return (
      <h1 className={`${BASE} ${GRADIENT} ${mode === 'fade' ? 'slogan-fade' : ''}`}>{text}</h1>
    );
  }
  let i = 0;
  return (
    <h1 ref={ref} className={`${BASE} relative`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(' ').map((word, w) => (
          <span key={w}>
            {w > 0 && ' '}
            <span className="inline-block whitespace-nowrap">
              {[...word].map((ch) => {
                const { delay, sway } = letters[i++]!;
                return (
                  <span
                    key={i}
                    className="slogan-letter"
                    style={{ '--d': `${delay}ms`, '--sx': `${sway}em` } as CSSProperties}
                  >
                    {ch}
                  </span>
                );
              })}
            </span>
          </span>
        ))}
      </span>
    </h1>
  );
}

/** A start time (0–900ms, in a random order) and a small sideways sway for each letter. */
function scatter(text: string): { delay: number; sway: number }[] {
  const n = text.replaceAll(' ', '').length;
  const order = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [order[k], order[j]] = [order[j]!, order[k]!];
  }
  const rank = new Array<number>(n);
  order.forEach((letter, r) => (rank[letter] = r));
  return rank.map((r) => ({
    delay: Math.round((r / Math.max(1, n - 1)) * 900),
    sway: Math.round((Math.random() * 0.7 - 0.35) * 100) / 100,
  }));
}
