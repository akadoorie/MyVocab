import type { SVGProps } from 'react';

/** Inline line icons (PRD §9.2). Decorative: the button around each one carries the name. */
function Svg({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const StopIcon = () => (
  <Svg>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </Svg>
);

export const BulbIcon = () => (
  <Svg strokeWidth={2}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 6a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9Z" />
    <path d="M12 1.5v1.5M4.5 4.5l1 1M19.5 4.5l-1 1M2 11h1.5M20.5 11H22" />
  </Svg>
);

export const CheckIcon = () => (
  <Svg strokeWidth={3.2}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Svg>
);

export const CrossIcon = () => (
  <Svg strokeWidth={3.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

/** Next's chevron: points right in every language, as Next sits on the right (D-096). */
export const ChevronIcon = () => (
  <Svg strokeWidth={2.8}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);

/** A house: the way back to the Home page, in place of the word "Home" (D-086). */
export const HomeIcon = ({ className = 'h-[22px] w-[22px]' }: { className?: string }) => (
  <Svg strokeWidth={2.2} className={className}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </Svg>
);

/** "←" pointing the way back: mirrored on right-to-left pages (D-080). */
export const BackArrow = () => (
  <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
    ←
  </span>
);

/** The left-pointing chevron of Back (PRD FR-L29a): Back sits on the left in every language (D-096). */
export const ChevronBackIcon = () => (
  <Svg strokeWidth={2.8}>
    <path d="m15 5-7 7 7 7" />
  </Svg>
);

export const FlipIcon = () => (
  <Svg strokeWidth={2.6}>
    <path d="M7.5 6.2A8 8 0 1 0 12 4" />
    <path d="M7 2.5v4h4" />
  </Svg>
);

export const KeyboardIcon = () => (
  <Svg strokeWidth={1.8}>
    <rect x="2" y="5.5" width="20" height="13" rx="2.5" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 12.5h.01M9.5 12.5h.01M13 12.5h.01M16.5 12.5h.01M8 15.5h8" />
  </Svg>
);

/** A filled padlock: the badge on a locked button (D-042). */
export const LockIcon = () => (
  <Svg strokeWidth={2.4}>
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="currentColor" stroke="none" />
  </Svg>
);

/** The MyVocab mark: two stacked cards. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="logo-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b69bff" />
          <stop offset="1" stopColor="#7c4dff" />
        </linearGradient>
      </defs>
      <rect
        x="12"
        y="6"
        width="15"
        height="20"
        rx="3.5"
        transform="rotate(14 19.5 16)"
        fill="#e9e3ff"
        opacity="0.9"
      />
      <rect
        x="4"
        y="6"
        width="16"
        height="21"
        rx="3.5"
        transform="rotate(-12 12 16.5)"
        fill="url(#logo-a)"
      />
    </svg>
  );
}

/** Two opposite arrows: switch the From and To languages (D-055). */
export const SwapIcon = () => (
  <Svg strokeWidth={2.2}>
    <path d="M4 8h15M15 4l4 4-4 4" />
    <path d="M20 16H5M9 12l-4 4 4 4" />
  </Svg>
);
