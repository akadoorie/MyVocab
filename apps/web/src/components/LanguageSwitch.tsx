import { useLocale } from '../lib/locale';
import { strings, type Locale } from '../strings';

/**
 * Switches the UI between Hebrew and English (D-080): in the Home page header (D-083) and
 * throughout the practice loop (D-122). It shows the other language's short code in that
 * language ("En" / "עב"); its accessible name is the full name. The switch is live: a practice
 * in progress keeps its cards and answers.
 */
export function LanguageSwitch({ className = 'rounded-[10px]' }: { className?: string }) {
  const { setLocale } = useLocale();
  const next = strings.locale.switchLang as Locale;
  return (
    <button
      type="button"
      lang={next}
      onClick={() => setLocale(next)}
      className={`min-h-11 min-w-11 shrink-0 border border-border px-2 font-semibold text-muted hover:border-accent hover:text-text ${className}`}
      data-testid="language-switch"
    >
      <span aria-hidden="true">{strings.locale.switchLabel}</span>
      <span className="sr-only">{strings.locale.switchName}</span>
    </button>
  );
}
