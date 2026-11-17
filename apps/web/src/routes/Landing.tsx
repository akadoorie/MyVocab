import type { StartChoices } from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { useToast } from '../components/Toast';
import { StartCard } from '../features/setup/StartCard';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { strings } from '../strings';

/**
 * Landing page (PRD FR-L1): hero, "How it works" and the start card. It never shows real
 * vocabulary (PRD §9.7).
 */
export function Landing() {
  const session = useSession();
  const location = useLocation();
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, staleTime: 60_000 });
  const initialSelection = (location.state as { selection?: StartChoices } | null)?.selection;
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  // Back from a failed Google sign-in (`/?signin=error&error=…`).
  const signInFailed = params.get('signin') === 'error';
  useEffect(() => {
    if (!signInFailed) return;
    toast.show({ message: strings.auth.signInFailed });
    setParams({}, { replace: true });
  }, [signInFailed, toast, setParams]);

  return (
    <main
      id="main"
      className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 pb-10 md:grid-cols-2 md:items-start md:gap-12 md:pt-8"
    >
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-5xl">
          {strings.landing.heroTitle}
        </h1>
        <p className="text-lg text-muted">{strings.landing.heroBody}</p>
        {session.isGuest && !session.loading && (
          <p className="rounded-[10px] border border-border bg-surface px-4 py-3 text-sm text-muted">
            {strings.landing.guestBanner}
          </p>
        )}
        <section aria-labelledby="how-title" className="hidden md:block">
          <h2 id="how-title" className="mb-3 text-lg font-semibold">
            {strings.landing.howItWorks}
          </h2>
          <ol className="space-y-3">
            {strings.landing.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-accent">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div>
        {meta.data && !session.loading ? (
          <StartCard
            key={session.isGuest ? 'guest' : 'user'}
            meta={meta.data}
            session={session}
            initialSelection={initialSelection}
          />
        ) : meta.isError ? (
          <p role="alert" className="text-dontknow">
            {strings.setup.genericError}
          </p>
        ) : (
          <div
            className="h-96 animate-pulse rounded-[14px] border border-border bg-surface"
            aria-busy="true"
          />
        )}
      </div>

      <section aria-labelledby="how-title-m" className="md:hidden">
        <h2 id="how-title-m" className="mb-3 text-lg font-semibold">
          {strings.landing.howItWorks}
        </h2>
        <ol className="list-inside list-decimal space-y-2 text-muted">
          {strings.landing.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
