import type { StartChoices } from '@myvocab/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
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
  const [params, setParams] = useSearchParams();

  // Back from a failed Google sign-in: the server sends `?signin=refused` (this account may not
  // sign in) or `?signin=error` (anything else), never the reason (PRD FR-L56). The notice stays
  // until dismissed; the address is cleaned at once, so a refresh doesn't repeat it.
  const signin = params.get('signin');
  const [signInNotice, setSignInNotice] = useState<string | null>(() =>
    signin === 'refused'
      ? strings.auth.signInRefused
      : signin === 'error'
        ? strings.auth.signInFailed
        : null,
  );
  // Remembered for this visit: the address is cleaned right away, but the guest toast stays quiet.
  const [backFromSignIn] = useState(signin !== null);
  useEffect(() => {
    if (signin) setParams({}, { replace: true });
  }, [signin, setParams]);

  return (
    <main
      id="main"
      className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 pb-10 md:grid-cols-2 md:items-start md:gap-12 md:pt-8"
    >
      {signInNotice && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-[16px] border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.08)] px-4 py-3 md:col-span-2"
        >
          <span aria-hidden="true" className="pt-0.5 text-hint">
            ⓘ
          </span>
          <p className="flex-1 text-text">{signInNotice}</p>
          <button
            type="button"
            aria-label={strings.auth.dismiss}
            onClick={() => setSignInNotice(null)}
            className="-my-1 flex min-h-9 min-w-9 items-center justify-center rounded-full text-muted hover:text-text"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-col gap-6">
        <h1 className="bg-gradient-to-br from-text to-[#b9a6ff] bg-clip-text text-3xl leading-tight font-bold tracking-tight text-transparent md:text-5xl">
          {strings.landing.heroTitle}
        </h1>
        <p className="text-lg text-muted">{strings.landing.heroBody}</p>
        {session.isGuest && !session.loading && (
          <p className="glass px-4 py-3 text-sm text-muted">{strings.landing.guestBanner}</p>
        )}
        <section aria-labelledby="how-title" className="hidden md:block">
          <h2 id="how-title" className="mb-3 text-lg font-semibold">
            {strings.landing.howItWorks}
          </h2>
          <ol className="space-y-3">
            {strings.landing.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#3e2d7e] to-[#251a50] text-sm font-bold text-[#c4b5ff] shadow-[0_0_16px_rgba(109,76,255,0.35)]">
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
            quiet={backFromSignIn}
          />
        ) : meta.isError ? (
          <p role="alert" className="text-dontknow">
            {strings.setup.genericError}
          </p>
        ) : (
          <div className="glass h-96 animate-pulse" aria-busy="true" />
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
