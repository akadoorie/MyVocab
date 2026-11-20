import { CheckIcon, CrossIcon } from '../components/Icons';
import { strings } from '../strings';

/**
 * "Buttons" under "How it works" (D-030): a small copy of each answer button, in its colour, and
 * what it does. Guests see the orange one greyed out, as in a session.
 */
export function ButtonGuide({ isGuest, headingId }: { isGuest: boolean; headingId: string }) {
  const g = strings.landing.buttonGuide;
  const rows = [
    {
      kind: 'know',
      icon: <CheckIcon />,
      label: strings.loop.know,
      text: isGuest ? g.knowGuest : g.know,
      locked: false,
    },
    {
      kind: 'again',
      icon: <CheckIcon />,
      label: strings.loop.know,
      text: isGuest ? g.againGuest : g.again,
      locked: isGuest,
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
            <span
              aria-hidden="true"
              className={`mini-btn mini-btn--${row.kind} shrink-0 ${row.locked ? 'is-locked' : ''}`}
            >
              {row.icon}
              {row.label}
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
