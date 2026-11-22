import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/Toast';
import { Layout } from '../routes/Layout';
import { en } from '../strings.en';
import { he } from '../strings.he';
import { activateLocale, languageName, strings, topicName } from '../strings';
import { mockFetch } from '../test/render';
import { initLocale, LocaleProvider, localeFor, readSavedLocale } from './locale';

afterEach(() => vi.restoreAllMocks());

// Components, not elements: they read `strings` when they render.
const Page = () => <p>{strings.notFound.title}</p>;
const AdminPage = () => <p>admin: {strings.notFound.title}</p>;

function renderApp(path = '/') {
  const router = createMemoryRouter(
    [
      { path: '/', Component: Layout, children: [{ index: true, Component: Page }] },
      { path: '/admin', Component: AdminPage },
    ],
    { initialEntries: [path] },
  );
  initLocale(path);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <LocaleProvider router={router}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('UI language (D-080)', () => {
  it('is Hebrew by default, right-to-left', async () => {
    mockFetch({}, null);
    expect(readSavedLocale()).toBe('he');
    renderApp();
    expect(await screen.findByText(he.notFound.title)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'he');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('link', { name: he.nav.privacy })).toBeInTheDocument();
  });

  it('switches to English from the footer and remembers it', async () => {
    mockFetch({}, null);
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'English' }));
    expect(await screen.findByText(en.notFound.title)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(window.localStorage.getItem('myvocab.locale')).toBe('en');
    expect(readSavedLocale()).toBe('en');
    // And back: the switch names Hebrew in Hebrew.
    fireEvent.click(screen.getByRole('button', { name: 'עברית' }));
    expect(await screen.findByText(he.notFound.title)).toBeInTheDocument();
  });

  it('keeps the admin area in English, and goes back to Hebrew when leaving it', async () => {
    mockFetch({}, null);
    expect(localeFor('/admin/items', 'he')).toBe('en');
    expect(localeFor('/administrator', 'he')).toBe('he');
    const router = renderApp('/admin');
    expect(await screen.findByText(`admin: ${en.notFound.title}`)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    await router.navigate('/');
    expect(await screen.findByText(he.notFound.title)).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement).toHaveAttribute('dir', 'rtl'));
  });

  it('ignores a saved value that is not a language', () => {
    window.localStorage.setItem('myvocab.locale', 'fr');
    expect(readSavedLocale()).toBe('he');
  });
});

describe('Hebrew strings', () => {
  /** Every leaf, with functions called on sample arguments. */
  function leaves(value: unknown, path: string, out: [string, string][]) {
    if (typeof value === 'string') out.push([path, value]);
    else if (typeof value === 'function')
      out.push([path, String((value as (...a: unknown[]) => unknown)(1, 2, 3, 4))]);
    else if (value && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) leaves(v, `${path}.${k}`, out);
  }

  it('has every English key, none empty', () => {
    const enLeaves: [string, string][] = [];
    const heLeaves: [string, string][] = [];
    leaves(en, '', enLeaves);
    leaves(he, '', heLeaves);
    expect(heLeaves.map(([p]) => p)).toEqual(enLeaves.map(([p]) => p));
    // Text around a link may be empty on one side, depending on the word order.
    const mayBeEmpty = new Set(['.loop.lockedTipBefore', '.loop.lockedTip']);
    for (const [path, text] of heLeaves)
      if (!mayBeEmpty.has(path)) expect(text.trim(), path).not.toBe('');
  });

  it('counts in Hebrew, with "one" spelled out', () => {
    expect(he.known.count(1)).toBe('מילה מוכרת אחת');
    expect(he.known.count(3)).toBe('3 מילים מוכרות');
    expect(he.loop.cycleBreak(2, 1)).toBe('סבב 2 · נשאר כרטיס אחד');
    expect(he.setup.dailyCap(4)).toContain('עוד 4 כרטיסים');
  });

  it('names languages and topics in the UI language', () => {
    const topic = { name: 'Home', nameHe: 'בית' };
    expect(topicName(topic)).toBe('Home');
    expect(languageName({ code: 'he', name: 'Hebrew' })).toBe('Hebrew');
    activateLocale('he');
    expect(topicName(topic)).toBe('בית');
    expect(topicName({ name: 'Food', nameHe: null })).toBe('Food');
    expect(languageName({ code: 'he', name: 'Hebrew' })).toBe('עברית');
    expect(languageName({ code: 'fr', name: 'French' })).toBe('French');
  });
});
