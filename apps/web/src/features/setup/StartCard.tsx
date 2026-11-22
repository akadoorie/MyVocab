import type { MetaResponse } from '@myvocab/contracts';
import {
  allowedSizes,
  defaultFields,
  differsFromDefaults,
  fitSize,
  isSameLanguage,
  type StartChoices,
} from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { Field, Segmented } from '../../components/Field';
import { SwapIcon } from '../../components/Icons';
import { useToast } from '../../components/Toast';
import { api } from '../../lib/api';
import { startGoogleSignIn, type SessionState } from '../../lib/session';
import { readFlag, writeFlag } from '../../lib/storage';
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/useMediaQuery';
import { strings } from '../../strings';
import { useDebounced } from './useDebounced';
import { useStartLoop } from './useStartLoop';

const GUEST_TOAST_FLAG = 'myvocab.guestAmountToast';
/** How long the guest amount message stays: the toast on phones, inside the field on desktop (D-045). */
const GUEST_TOAST_MS = 2000;
const AMOUNT_TIP_MS = GUEST_TOAST_MS;
/** How long the Topic counts are kept for a direction before asking again (D-064). */
const COUNTS_STALE_MS = 5 * 60_000;

export type { LoopStartNotice } from './useStartLoop';

/**
 * The start card (PRD §6.1, §9.5). Every field has a default, so Start works immediately: on
 * phones the Start button comes first, above the settings, so it is reachable without scrolling;
 * on wider screens it stays at the bottom of the settings panel.
 */
export function StartCard({
  meta,
  session,
  initialSelection,
  quiet = false,
}: {
  meta: MetaResponse;
  session: SessionState;
  initialSelection?: StartChoices | undefined;
  /** Hold back the automatic guest toast (a failed sign-in notice is showing, FR-L56). */
  quiet?: boolean;
}) {
  const isGuest = session.isGuest;
  const isAdmin = session.user?.role === 'admin';
  const isDesktop = useMediaQuery(DESKTOP_QUERY, true);
  const toast = useToast();
  const {
    start: startLoop,
    starting,
    error,
    setError,
    containerRef,
  } = useStartLoop({
    meta,
    isGuest,
  });

  const defaults: StartChoices = useMemo(
    () => ({ ...meta.defaults, size: isGuest ? meta.guest.loopSize : meta.defaults.size }),
    [meta, isGuest],
  );
  const [choices, setChoices] = useState<StartChoices>(() =>
    initialSelection
      ? { ...initialSelection, size: isGuest ? meta.guest.loopSize : initialSelection.size }
      : defaults,
  );

  const guestToast = useMemo(
    () => ({
      lead: { label: strings.nav.signInLink, onClick: startGoogleSignIn },
      message: strings.setup.guestAmountToast,
      // Short on phones (D-045): a scroll pauses the timer, so a long toast seemed stuck.
      durationMs: GUEST_TOAST_MS,
    }),
    [],
  );

  // The guest amount message (FR-L6). On desktop it covers the Amount field itself for a few
  // seconds (D-044); on phones it is a toast.
  const [amountTip, setAmountTip] = useState(false);
  const amountTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(amountTimer.current), []);
  const showGuestMessage = useCallback(() => {
    if (!isDesktop) {
      toast.show(guestToast);
      return;
    }
    setAmountTip(true);
    window.clearTimeout(amountTimer.current);
    amountTimer.current = window.setTimeout(() => setAmountTip(false), AMOUNT_TIP_MS);
  }, [isDesktop, toast, guestToast]);

  // FR-L6: the guest message appears once per browser session automatically.
  const shownRef = useRef(false);
  useEffect(() => {
    if (quiet || !isGuest || shownRef.current || readFlag('session', GUEST_TOAST_FLAG)) return;
    shownRef.current = true;
    writeFlag('session', GUEST_TOAST_FLAG);
    showGuestMessage();
  }, [quiet, isGuest, showGuestMessage]);

  // Every count for the chosen direction in one request (D-064): the count line and each Topic
  // option read from it, so changing the topic asks nothing. Kept for 5 minutes per direction,
  // and fetched again each time the start card opens (after a session, words may be known).
  const direction = useDebounced({ source: choices.sourceLang, target: choices.targetLang }, 300);
  const available = useQuery({
    queryKey: ['availableByTopic', direction.source, direction.target, session.user?.id ?? null],
    queryFn: () => api.availableByTopic(direction.source, direction.target),
    staleTime: COUNTS_STALE_MS,
    refetchOnMount: 'always',
  });
  // Counts for another direction (the debounce hasn't caught up yet) aren't shown.
  const counts =
    direction.source === choices.sourceLang && direction.target === choices.targetLang
      ? available.data
      : undefined;
  const checking = counts === undefined && !available.isError;
  /** "Home [15]" once the counts are in (D-064). */
  const withCount = (name: string, n: number | undefined) =>
    n === undefined ? name : `${name} [${n}]`;
  const topicCount = (id: number) => (counts ? (counts.topics[String(id)] ?? 0) : undefined);

  const set = <K extends keyof StartChoices>(key: K, value: StartChoices[K]) => {
    setError(null);
    setChoices((c) => ({ ...c, [key]: value }));
  };

  // Guests play the sample set (D-038); admins may pick it too.
  const count = !counts
    ? undefined
    : isGuest || choices.sample
      ? counts.sample
      : choices.topicId === null
        ? counts.all
        : topicCount(choices.topicId);
  // Amounts above the available count are greyed out (D-057). While a new count loads, the
  // last one is kept, so the buttons don't flash enabled.
  const [lastCount, setLastCount] = useState<number | undefined>(undefined);
  if (count !== undefined && count !== lastCount) setLastCount(count);
  const sizes = allowedSizes(meta.sizeOptions, count ?? lastCount);
  // A chosen amount that is no longer allowed shows (and starts) as the largest allowed one. The
  // choice itself is kept, so it comes back when more cards are available again.
  const effective: StartChoices = isGuest
    ? choices
    : { ...choices, size: fitSize(choices.size, sizes) };
  const defaultSet = defaultFields(effective, defaults);

  async function start() {
    if ((await startLoop(effective)) === 'empty') void available.refetch();
  }

  const nothingLeft = count === 0;
  const blockedByMaintenance = meta.maintenance.enabled && session.user?.role !== 'admin';
  const guestsDisabled = isGuest && !meta.guest.enabled;
  const languageOptions = meta.languages.map((l) => ({ value: l.code, label: l.name }));

  const startButton = guestsDisabled ? (
    <Button3D size="lg" className="w-full" onClick={startGoogleSignIn}>
      {strings.setup.signInToStart}
    </Button3D>
  ) : nothingLeft ? (
    <div className="rounded-[10px] border border-border bg-surface-2 p-4 text-center">
      <p className="font-semibold">
        {isGuest ? strings.setup.emptyGuestTitle : strings.setup.emptyTitle}
      </p>
      <p className="mt-1 text-sm text-muted">
        {isGuest ? strings.setup.emptyGuestBody : strings.setup.emptyBody}
      </p>
      {!isGuest && (
        <Link to="/known" className="mt-3 inline-block text-sm text-accent hover:underline">
          {strings.setup.emptyKnownLink}
        </Link>
      )}
    </div>
  ) : (
    <Button3D
      size="lg"
      className="w-full"
      disabled={starting || blockedByMaintenance}
      onClick={() => void start()}
    >
      {starting ? (isGuest ? strings.setup.botCheck : strings.setup.starting) : strings.setup.start}
    </Button3D>
  );

  const turnstileAndError = (
    <>
      <div ref={containerRef} className="mt-3 flex justify-center empty:hidden" />

      {error && (
        <p role="alert" className="mt-3 text-sm text-dontknow">
          {error}
        </p>
      )}
    </>
  );

  // The count stands out in yellow, like the version and the registered users (D-054).
  const availableLine = (
    <p className="text-sm text-muted" aria-live="polite">
      {checking ? (
        strings.setup.checking
      ) : count !== undefined ? (
        <>
          <span className="font-semibold text-hint">{count}</span>{' '}
          {strings.setup.availableSuffix(count)}
        </>
      ) : (
        ''
      )}
    </p>
  );

  return (
    <section aria-labelledby="start-title" className="flex flex-col gap-6">
      {!isDesktop && (
        <div>
          {startButton}
          {turnstileAndError}
        </div>
      )}
      <div className="glass p-5 md:p-7">
        <h2 id="start-title" className="mb-2 text-xl font-semibold">
          {strings.setup.title}
        </h2>

        {/* The count first, before the fields (D-060), with "Reset to defaults" beside it. */}
        <div className="mb-4 flex min-h-6 items-center justify-between gap-3">
          {availableLine}
          {differsFromDefaults(effective, defaults) && (
            <button
              type="button"
              className="text-sm text-accent underline-offset-2 hover:underline"
              onClick={() => {
                setError(null);
                setChoices(defaults);
              }}
            >
              {strings.setup.reset}
            </button>
          )}
        </div>

        {/* Phones and desktop alike: From ⇄ To on one line, Topic and Amount on the next (D-055).
            One grid for both lines, so Topic sits exactly under From and Amount under To, same
            widths; the switch column stays empty on the second line (D-056). */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2 gap-y-4 md:gap-x-3">
          <Field label={strings.setup.source} inRow isDefault={defaultSet.has('sourceLang')}>
            {({ id, className }) => (
              <select
                id={id}
                className={className}
                value={choices.sourceLang}
                onChange={(e) => set('sourceLang', e.target.value)}
              >
                {languageOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {/* Same height as the selects, so the button sits centred beside them. */}
          <div className="flex h-[50px] items-center self-end max-md:h-[46px]">
            <button
              type="button"
              aria-label={strings.setup.swapLanguages}
              title={strings.setup.swapLanguages}
              disabled={isSameLanguage(choices)}
              onClick={() => {
                setError(null);
                setChoices((c) => ({ ...c, sourceLang: c.targetLang, targetLang: c.sourceLang }));
              }}
              className="grid size-8 place-items-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent hover:text-text focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted [&>svg]:size-4"
            >
              <SwapIcon />
            </button>
          </div>
          <Field label={strings.setup.target} inRow isDefault={defaultSet.has('targetLang')}>
            {({ id, className }) => (
              <select
                id={id}
                className={className}
                value={choices.targetLang}
                onChange={(e) => set('targetLang', e.target.value)}
              >
                {languageOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {isSameLanguage(choices) && (
            <p className="col-span-3 -mt-2 text-sm text-muted" role="note">
              {strings.setup.sameLanguageNote}
            </p>
          )}
          <Field
            label={strings.setup.topic}
            inRow
            isDefault={isGuest || (defaultSet.has('topicId') && !choices.sample)}
          >
            {({ id, className }) =>
              isGuest ? (
                // Guests play the sample set (D-038). The other topics are listed, greyed out
                // and unselectable, to show what signing in unlocks.
                <div className="relative">
                  <select
                    id={id}
                    className={`${className} topic-select pl-9 max-md:pr-1 max-md:pl-8`}
                    value="sample"
                    onChange={() => {}}
                  >
                    <option value="sample" className="topic-special">
                      {/* No count here: it's the "N cards available" line above, and the
                          narrow phone field (with its lock) has no room for both (D-065). */}
                      {strings.setup.sampleSet}
                    </option>
                    <option value="" disabled className="topic-special">
                      {withCount(strings.setup.general, counts?.all)}
                    </option>
                    {/* A line between the special choices and the topics, all left-aligned (D-062).
                        No optgroup: desktop Chrome draws disabled options inside a group in its
                        own light grey and ignores ours (D-041). */}
                    {meta.topics.length > 0 && <hr />}
                    {meta.topics.map((c) => (
                      <option key={c.id} value={c.id} disabled>
                        {/* The full count: what signing in unlocks (D-064). */}
                        {withCount(c.name, topicCount(c.id))}
                      </option>
                    ))}
                  </select>
                  <span
                    aria-hidden="true"
                    // On the left, the same lock and size as the Amount field's (D-052).
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base leading-none max-md:left-2.5"
                  >
                    🔒
                  </span>
                </div>
              ) : (
                <select
                  id={id}
                  className={`${className} topic-select`}
                  value={choices.sample ? 'sample' : (choices.topicId ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    setError(null);
                    setChoices(({ sample: _sample, ...c }) =>
                      v === 'sample'
                        ? { ...c, topicId: null, sample: true }
                        : { ...c, topicId: v === '' ? null : Number(v) },
                    );
                  }}
                >
                  {isAdmin && (
                    // Admins can play exactly what guests get (D-038).
                    <option value="sample" className="topic-special">
                      {withCount(strings.setup.sampleSet, counts?.sample)}
                    </option>
                  )}
                  <option value="" className="topic-special">
                    {withCount(strings.setup.general, counts?.all)}
                  </option>
                  {/* A line between the special choices and the real topics, all left-aligned
                      (D-062; replaces the "Topics" heading of D-040). */}
                  {meta.topics.length > 0 && <hr />}
                  {meta.topics.map((c) => (
                    // A topic with nothing left to play is greyed out (D-064).
                    <option key={c.id} value={c.id} disabled={topicCount(c.id) === 0}>
                      {withCount(c.name, topicCount(c.id))}
                    </option>
                  ))}
                </select>
              )
            }
          </Field>
          {/* Amount sits next to Topic, where Type used to be (D-046), under To. */}
          <div className="col-start-3">
            <Field label={strings.setup.amount} inRow isDefault={defaultSet.has('size')}>
              {({ id }) =>
                isGuest ? (
                  <div className="relative">
                    <button
                      id={id}
                      type="button"
                      aria-label={`${strings.setup.amount}: ${meta.guest.loopSize}. ${strings.setup.guestAmountLocked}`}
                      onClick={showGuestMessage}
                      className="flex h-[50px] w-full items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 text-text max-md:h-[46px]"
                    >
                      <span aria-hidden="true">🔒</span>
                      <span className="font-semibold">{meta.guest.loopSize}</span>
                    </button>
                    {/* Desktop: the message covers the field itself (D-044). */}
                    <div aria-live="polite">
                      {amountTip && (
                        <p className="amount-tip">
                          {/* One inline run, so the space after the link is kept. */}
                          <span>
                            <button
                              type="button"
                              onClick={startGoogleSignIn}
                              className="font-semibold text-accent underline underline-offset-2 hover:text-text"
                            >
                              {strings.nav.signInLink}
                            </button>{' '}
                            {strings.setup.guestAmountToast}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <Segmented
                    id={id}
                    label={strings.setup.amount}
                    isDefault={defaultSet.has('size')}
                    value={effective.size}
                    onChange={(v) => set('size', v)}
                    options={meta.sizeOptions.map((n) => ({
                      value: n,
                      label: String(n),
                      disabled: !sizes.includes(n),
                    }))}
                  />
                )
              }
            </Field>
          </div>
        </div>

        {isDesktop && (
          <>
            {turnstileAndError}
            <div className="mt-5">{startButton}</div>
          </>
        )}
      </div>
    </section>
  );
}
