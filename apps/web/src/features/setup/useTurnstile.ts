import { useCallback, useEffect, useRef } from 'react';

/**
 * Invisible Cloudflare Turnstile for guests (PRD FR-L10, §14.3). The script is loaded only when a
 * guest sees the start card; a fresh single-use token is requested when they press Start. If
 * Turnstile needs an interactive challenge, it appears inside `containerRef`.
 */

type TurnstileApi = {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      execution: 'execute';
      appearance: 'interaction-only';
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    },
  ): string;
  execute(el: HTMLElement | string): void;
  reset(id: string): void;
  remove(id: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile'));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile(siteKey: string | undefined, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const renderedIn = useRef<HTMLElement | null>(null);
  const pending = useRef<{ resolve: (t: string) => void; reject: (e: Error) => void } | null>(null);

  useEffect(() => {
    if (enabled && siteKey) loadScript().catch(() => undefined);
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [enabled, siteKey]);

  const getToken = useCallback(async (): Promise<string> => {
    if (!siteKey || !containerRef.current) throw new Error('Turnstile not ready');
    const ts = await loadScript();
    const el = containerRef.current;
    const token = new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
    });
    // The container moves when the window crosses the phone/desktop width (StartCard places the
    // Start button differently), so a widget drawn into an old container is drawn again.
    if (widgetId.current && renderedIn.current !== el) {
      ts.remove(widgetId.current);
      widgetId.current = null;
    }
    if (!widgetId.current) {
      renderedIn.current = el;
      widgetId.current = ts.render(el, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (t) => pending.current?.resolve(t),
        'error-callback': () => pending.current?.reject(new Error('Turnstile error')),
        'expired-callback': () => pending.current?.reject(new Error('Turnstile expired')),
      });
    } else {
      ts.reset(widgetId.current); // tokens are single-use
    }
    ts.execute(el);
    try {
      return await token;
    } finally {
      pending.current = null;
    }
  }, [siteKey]);

  return { containerRef, getToken };
}
