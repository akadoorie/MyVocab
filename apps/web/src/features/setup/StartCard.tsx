import type { MetaResponse } from '@myvocab/contracts';
import {
  createLoop,
  defaultFields,
  differsFromDefaults,
  isSameLanguage,
  randomSeed,
  type StartChoices,
} from '@myvocab/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button3D } from '../../components/Button3D';
import { Field, Segmented } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { api, ApiError } from '../../lib/api';
import { ME_QUERY_KEY, startGoogleSignIn, type SessionState } from '../../lib/session';
import { readFlag, writeFlag } from '../../lib/storage';
import { strings } from '../../strings';
import { saveLoop } from '../loop/loop-storage';
import { useDebounced } from './useDebounced';
import { useTurnstile } from './useTurnstile';

const GUEST_TOAST_FLAG = 'myvocab.guestAmountToast';

export type LoopStartNotice = { insufficient?: string };

function remainingOf(details: unknown): number {
  const remaining = (details as { remaining?: unknown } | undefined)?.remaining;
  return typeof remaining === 'number' ? remaining : 0;
}

/** The start card (PRD §6.1, §9.5). Every field has a default, so Start works immediately. */
export function StartCard({
  meta,
  session,
  initialSelection,
}: {
  meta: MetaResponse;
  session: SessionState;
  initialSelection?: StartChoices | undefined;
}) {
  const isGuest = session.isGuest;
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { containerRef, getToken } = useTurnstile(
    meta.turnstileSiteKey,
    isGuest && meta.guest.enabled,
  );

  const defaults: StartChoices = useMemo(
    () => ({ ...meta.defaults, size: isGuest ? meta.guest.loopSize : meta.defaults.size }),
    [meta, isGuest],
  );
  const [choices, setChoices] = useState<StartChoices>(() =>
    initialSelection
      ? { ...initialSelection, size: isGuest ? meta.guest.loopSize : initialSelection.size }
      : defaults,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultSet = defaultFields(choices, defaults);

  const guestToast = useMemo(
    () => ({
      message: strings.setup.guestAmountToast,
      action: { label: strings.nav.signIn, onClick: startGoogleSignIn },
    }),
    [],
  );

  // FR-L6: the guest toast appears once per browser session automatically.
  const shownRef = useRef(false);
  useEffect(() => {
    if (!isGuest || shownRef.current || readFlag('session', GUEST_TOAST_FLAG)) return;
    shownRef.current = true;
    writeFlag('session', GUEST_TOAST_FLAG);
    toast.show(guestToast);
  }, [isGuest, toast, guestToast]);

  const query = useDebounced(
    {
      source: choices.sourceLang,
      target: choices.targetLang,
      type: choices.type,
      categoryId: choices.categoryId,
    },
    300,
  );
  const available = useQuery({
    queryKey: ['available', query],
    queryFn: () =>
      api.available({
        source: query.source,
        target: query.target,
        type: query.type,
        ...(query.categoryId === null ? {} : { categoryId: query.categoryId }),
      }),
  });

  const set = <K extends keyof StartChoices>(key: K, value: StartChoices[K]) => {
    setError(null);
    setChoices((c) => ({ ...c, [key]: value }));
  };

  const topicName =
    choices.categoryId === null
      ? strings.setup.general
      : (meta.categories.find((c) => c.id === choices.categoryId)?.name ?? strings.setup.general);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const turnstileToken = isGuest ? await getToken() : undefined;
      const res = await api.startLoop({
        source: choices.sourceLang,
        target: choices.targetLang,
        type: choices.type,
        categoryId: choices.categoryId,
        ...(isGuest ? {} : { size: choices.size }),
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      if (res.cards.length === 0) {
        void available.refetch();
        return;
      }
      saveLoop({
        cards: res.cards,
        state: createLoop(
          res.cards.map((c) => c.itemId),
          randomSeed(),
        ),
        undoWindowSeconds: meta.undoWindowSeconds,
        selection: choices,
        isGuest,
      });
      const notice: LoopStartNotice =
        res.returned < res.requested
          ? { insufficient: strings.loop.insufficient(res.returned, topicName) }
          : {};
      navigate('/loop', { state: notice });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'BOT_CHECK_FAILED')
        setError(strings.setup.botCheckFailed);
      else if (e instanceof ApiError && e.code === 'RATE_LIMITED' && !isGuest)
        setError(strings.setup.dailyCap(remainingOf(e.details)));
      else if (e instanceof ApiError && e.code === 'UNAUTHORIZED' && !isGuest) {
        setError(strings.setup.sessionExpired);
        void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      } else if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error && e.message.startsWith('Turnstile'))
        setError(strings.setup.botCheckFailed);
      else setError(strings.setup.genericError);
    } finally {
      setStarting(false);
    }
  }

  const count = available.data?.available;
  const nothingLeft = count === 0;
  const blockedByMaintenance = meta.maintenance.enabled && session.user?.role !== 'admin';
  const guestsDisabled = isGuest && !meta.guest.enabled;
  const languageOptions = meta.languages.map((l) => ({ value: l.code, label: l.name }));

  return (
    <section
      aria-labelledby="start-title"
      className="rounded-[14px] border border-border bg-surface p-5 shadow-[var(--card-shadow)] md:p-6"
    >
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
        <Field label={strings.setup.category} isDefault={defaultSet.has('categoryId')}>
          {({ id, className }) => (
            <select
              id={id}
              className={className}
              value={choices.categoryId ?? ''}
              onChange={(e) =>
                set('categoryId', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">{strings.setup.general}</option>
              {meta.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={strings.setup.type} isDefault={defaultSet.has('type')}>
          {({ id }) => (
            <Segmented
              id={id}
              label={strings.setup.type}
              isDefault={defaultSet.has('type')}
              value={choices.type}
              onChange={(v) => set('type', v)}
              options={meta.types.map((t) => ({ value: t.id, label: t.label }))}
            />
          )}
        </Field>
        <div className="md:col-span-2">
          <Field label={strings.setup.amount} isDefault={defaultSet.has('size')}>
            {({ id }) =>
              isGuest ? (
                <button
                  id={id}
                  type="button"
                  aria-label={`${strings.setup.amount}: ${meta.guest.loopSize}. ${strings.setup.guestAmountLocked}`}
                  onClick={() => toast.show(guestToast)}
                  className="flex min-h-12 w-full items-center gap-2 rounded-[10px] border border-dashed border-border bg-surface-2 px-3 text-muted"
                >
                  <span aria-hidden="true">🔒</span>
                  <span className="font-semibold">{meta.guest.loopSize}</span>
                </button>
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

      <div ref={containerRef} className="mt-3 flex justify-center empty:hidden" />

      {error && (
        <p role="alert" className="mt-3 text-sm text-dontknow">
          {error}
        </p>
      )}

      <div className="mt-5">
        {guestsDisabled ? (
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
            {starting
              ? isGuest
                ? strings.setup.botCheck
                : strings.setup.starting
              : strings.setup.start}
          </Button3D>
        )}
      </div>
    </section>
  );
}
