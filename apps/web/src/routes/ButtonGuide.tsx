import { LockIcon } from '../components/Icons';
import { startGoogleSignIn } from '../lib/session';
import { strings } from '../strings';

/**
 * "Buttons" under "How it works" (D-030): a small copy of each answer button as it looks in a
 * session, with its caption (D-058), and what it does. Guests see the green one locked, as in a session (D-042).
 */
export function ButtonGuide({ isGuest, headingId }: { isGuest: boolean; headingId: string }) {
  const g = strings.landing.buttonGuide;
  const rows = [
    {
      kind: 'know',
      label: strings.loop.know,
      caption: strings.loop.knowCaption,
      text: isGuest ? g.knowGuest : g.know,
      locked: isGuest,
    },
    {
      kind: 'again',
      label: strings.loop.know,
      caption: strings.loop.againCaption,
      text: g.again,
      locked: false,
    },
    {
      kind: 'dontknow',
      label: strings.loop.dontKnow,
      caption: strings.loop.dontKnowCaption,
      text: g.dontKnow,
      locked: false,
    },
  ] as const;
  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 id={headingId} className="mb-3 font-semibold">
        {strings.landing.buttonsTitle}
      </h3>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.kind} className="flex items-start gap-4">
            {/* A small copy of the session's pill, with its caption under it (D-058). The lock
                sits beside the darkened button, not in it, so it stays bright. */}
            <span aria-hidden="true" className="flex w-36 shrink-0 flex-col items-center">
              <span className="relative inline-flex">
                <span className={`mini-btn mini-btn--${row.kind} ${row.locked ? 'is-locked' : ''}`}>
                  {row.label}
                </span>
                {row.locked && (
                  <span className="lock-badge mini-btn__lock">
                    <LockIcon />
                  </span>
                )}
              </span>
              <span className="mini-btn__caption">{row.caption}</span>
            </span>
            <span className={`text-sm ${row.locked ? 'text-muted' : ''}`}>
              {/* The button's name for screen readers (the mini button is hidden from them). */}
              <span className="sr-only">{row.label}: </span>
              {row.text}
              {row.locked && (
                <>
                  {' ('}
                  <button
                    type="button"
                    onClick={startGoogleSignIn}
                    className="font-semibold text-accent underline underline-offset-2 hover:text-text"
                  >
                    {strings.nav.signInLink}
                  </button>{' '}
                  {g.toEnable})
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
