import { useEffect, useState } from 'react';
import { healthResponseSchema } from '@myvocab/contracts';
import { Button3D } from './components/Button3D';
import { strings } from './strings';

type ApiState = 'checking' | 'ok' | 'down';

/** M0 shell: proves the SPA is served and can reach /api. The real landing page arrives in M3. */
export function App() {
  const [api, setApi] = useState<ApiState>('checking');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then(async (res) => healthResponseSchema.parse(await res.json()))
      .then(() => !cancelled && setApi('ok'))
      .catch(() => !cancelled && setApi('down'));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">{strings.app.name}</h1>
      <p className="text-lg text-muted">{strings.app.tagline}</p>
      <p className="text-muted">{strings.shell.comingSoon}</p>
      <div className="flex flex-wrap justify-center gap-3" aria-hidden="true">
        <Button3D variant="dontknow" tabIndex={-1}>
          Don&apos;t know
        </Button3D>
        <Button3D variant="hint" tabIndex={-1}>
          Hints
        </Button3D>
        <Button3D variant="flip" tabIndex={-1}>
          Flip
        </Button3D>
        <Button3D variant="know" tabIndex={-1}>
          Know
        </Button3D>
      </div>
      <p className="text-sm text-muted" role="status">
        {strings.shell.apiStatus}:{' '}
        {api === 'checking' ? '…' : api === 'ok' ? strings.shell.apiOk : strings.shell.apiDown}
      </p>
    </main>
  );
}
