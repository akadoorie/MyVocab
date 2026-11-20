import { CheckIcon, CrossIcon, LockIcon } from '../components/Icons';
import { strings } from '../strings';

/**
 * "Buttons" under "How it works" (D-030): a small copy of each answer button, in its colour, and
 * what it does. Guests see the green one locked, as in a session (D-042).
 */
export function ButtonGuide({ isGuest, headingId }: { isGuest: boolean; headingId: string }) {
  const g = strings.landing.buttonGuide;
  const rows = [
    {
      kind: 'know',
      icon: <CheckIcon />,
      label: strings.loop.know,
      text: isGuest ? g.knowGuest : g.know,
      locked: isGuest,
    },
    {
      kind: 'again',
      icon: <CheckIcon />,
      label: strings.loop.know,
      text: g.again,
      locked: false,
    },
    {
      kind: 'dontknow',
      icon: <CrossIcon />,
      label: strings.loop.dontKnow,
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
          <li key={row.kind} className="flex items-start gap-3">
            {/* The lock sits beside the darkened button, not in it, so it stays bright. */}
            <span aria-hidden="true" className="relative inline-flex shrink-0">
              <span className={`mini-btn mini-btn--${row.kind} ${row.locked ? 'is-locked' : ''}`}>
                {row.icon}
                {row.label}
              </span>
              {row.locked && (
                <span className="lock-badge mini-btn__lock">
                  <LockIcon />
                </span>
              )}
            </span>
            <span className={`text-sm ${row.locked ? 'text-muted' : ''}`}>
              {/* The button's name for screen readers, since the icon is decorative. */}
              <span className="sr-only">{row.label}: </span>
              {row.text}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
