import type { MetaResponse } from '@myvocab/contracts';
import {
  defaultFields,
  differsFromDefaults,
  isSameLanguage,
  type StartChoices,
} from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { Field, Segmented } from '../../components/Field';
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
/** Three non-breaking spaces: indents a topic under the guests' "Topics" heading (D-041). */
const INDENT = String.fromCharCode(160).repeat(3);

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
  const defaultSet = defaultFields(choices, defaults);

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

  const query = useDebounced(
    {
      source: choices.sourceLang,
      target: choices.targetLang,
      topicId: choices.topicId,
      sample: choices.sample === true,
    },
    300,
  );
  const available = useQuery({
    queryKey: ['available', query],
    queryFn: () =>
      api.available({
        source: query.source,
        target: query.target,
        ...(query.topicId === null ? {} : { topicId: query.topicId }),
        ...(query.sample ? { sample: 'true' as const } : {}),
      }),
  });

  const set = <K extends keyof StartChoices>(key: K, value: StartChoices[K]) => {
    setError(null);
    setChoices((c) => ({ ...c, [key]: value }));
  };

  async function start() {
    if ((await startLoop(choices)) === 'empty') void available.refetch();
  }

  const count = available.data?.available;
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

  return (
    <section aria-labelledby="start-title" className="flex flex-col gap-6">
      {!isDesktop && (
        <div>
          {startButton}
          {turnstileAndError}
        </div>
      )}
      <div className="glass p-5 md:p-7">
        <h2 id="start-title" className="mb-4 text-xl font-semibold">
          {strings.setup.title}
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={strings.setup.source} isDefault={defaultSet.has('sourceLang')}>
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
          <Field label={strings.setup.target} isDefault={defaultSet.has('targetLang')}>
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
            <p className="text-sm text-muted md:col-span-2" role="note">
              {strings.setup.sameLanguageNote}
            </p>
          )}
          <Field
            label={strings.setup.topic}
            isDefault={isGuest || (defaultSet.has('topicId') && !choices.sample)}
          >
            {({ id, className }) =>
              isGuest ? (
                // Guests play the sample set (D-038). The other topics are listed, greyed out
                // and unselectable, to show what signing in unlocks.
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <select
                      id={id}
                      className={`${className} topic-locked pl-9`}
                      value="sample"
                      onChange={() => {}}
                      aria-describedby={`${id}-locked`}
                    >
                      <option value="sample">{strings.setup.sampleSet}</option>
                      <option value="" disabled>
                        {strings.setup.general}
                      </option>
                      {/* No optgroup here: desktop Chrome draws disabled options inside a group in
                          its own light grey and ignores ours (D-041). A disabled "Topics" entry
                          stands in for the heading, and the topics are indented under it. */}
                      <option value="topics-heading" disabled className="topic-heading">
                        {strings.setup.topicsGroup}
                      </option>
                      {meta.topics.map((c) => (
                        <option key={c.id} value={c.id} disabled>
                          {INDENT + c.name}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden="true"
                      // On the left, the same lock and size as the Amount field's (D-052).
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base leading-none"
                    >
                      🔒
                    </span>
                  </div>
                  <p id={`${id}-locked`} className="text-xs text-muted">
                    {strings.setup.guestTopicLocked}
                  </p>
                </div>
              ) : (
                <select
                  id={id}
                  className={className}
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
                    <option value="sample">{strings.setup.sampleSet}</option>
                  )}
                  <option value="">{strings.setup.general}</option>
                  {/* The real topics under a heading, apart from "All topics" (D-040). */}
                  {meta.topics.length > 0 && (
                    <optgroup label={strings.setup.topicsGroup}>
                      {meta.topics.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )
            }
          </Field>
          {/* Amount sits next to Topic on desktop, where Type used to be (D-046). */}
          <div>
            <Field label={strings.setup.amount} isDefault={defaultSet.has('size')}>
              {({ id }) =>
                isGuest ? (
                  <div className="relative">
                    <button
                      id={id}
                      type="button"
                      aria-label={`${strings.setup.amount}: ${meta.guest.loopSize}. ${strings.setup.guestAmountLocked}`}
                      onClick={showGuestMessage}
                      className="flex min-h-12 w-full items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 text-text"
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
                    value={choices.size}
                    onChange={(v) => set('size', v)}
                    options={meta.sizeOptions.map((n) => ({ value: n, label: String(n) }))}
                  />
                )
              }
            </Field>
          </div>
        </div>

        <div className="mt-4 flex min-h-6 items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {available.isPending
              ? strings.setup.checking
              : count !== undefined
                ? strings.setup.available(count)
                : ''}
          </p>
          {differsFromDefaults(choices, defaults) && (
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
