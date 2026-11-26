/** The pointing hand of the practice hints (swipe D-135, Flip D-136); its fingertip is at (25, 2). */
export function Hand() {
  return (
    <svg viewBox="0 0 54 64" width="54" height="64" aria-hidden="true" focusable="false">
      <path
        className="hint-hand__palm"
        d="M20 6a5 5 0 0 1 10 0v22l1-0.4a5 5 0 0 1 6 2l0.5 1a5 5 0 0 1 6.5 2.4l0.4 0.8a5 5 0 0 1 6.6 3.3l0.6 2.2c1.8 7-0.3 14.6-5.6 19.7L44 61H22l-11-14c-2.2-2.8-1.7-6.8 1.1-9a6 6 0 0 1 7.9 0.4V6z"
      />
      <path className="hint-hand__knuckles" d="M30 30v9M37 32v8M44 35v6" />
    </svg>
  );
}
