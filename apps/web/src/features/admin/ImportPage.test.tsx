import type { SessionUser } from '@myvocab/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockFetch, renderRoutes, TEST_USER } from '../../test/render';
import { AdminApp } from './AdminApp';

const ADMIN: SessionUser = { ...TEST_USER, role: 'admin' };
const TOTALS = {
  newItems: 1,
  mergedItems: 0,
  newTranslationEntries: 1,
  newExplanationEntries: 0,
  newSynonyms: 0,
  newHints: 0,
  newCategories: 0,
  skippedDuplicates: 0,
};
const report = (over: Record<string, unknown>) =>
  Response.json({
    dryRun: true,
    committed: false,
    totals: TOTALS,
    errors: [],
    warnings: [],
    skippedConcurrent: 0,
    batches: 0,
    ...over,
  });

afterEach(() => vi.restoreAllMocks());

function setup(handler: (url: string) => Response) {
  const calls: string[] = [];
  mockFetch(
    {
      'POST /api/admin/import': (init, url) => {
        expect(init?.body).toBeInstanceOf(FormData);
        calls.push(url);
        return handler(url);
      },
    },
    ADMIN,
  );
  renderRoutes([{ path: '/admin/*', element: <AdminApp /> }], ['/admin/import']);
  return calls;
}

async function chooseFile() {
  const input = await screen.findByLabelText('CSV file (≤ 2 MB, ≤ 5,000 rows)');
  fireEvent.change(input, {
    target: { files: [new File(['lang,text,type'], 'batch.csv', { type: 'text/csv' })] },
  });
}

describe('ImportPage (FR-A60–61)', () => {
  it('lists dry-run errors and keeps Import disabled', async () => {
    setup(() =>
      report({ errors: [{ row: 3, column: 'translation_en', message: 'Own-language translation' }] }),
    );
    await chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Check the file (dry run)' }));
    expect(await screen.findByText('Own-language translation')).toBeVisible();
    expect(screen.getByText('1 error')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });

  it('a clean dry run (warnings allowed) enables Import, which commits with the same options', async () => {
    const calls = setup((url) =>
      url.includes('dryRun=false')
        ? report({ dryRun: false, committed: true, batches: 1 })
        : report({ warnings: [{ row: 2, column: 'text', message: 'Mixed scripts' }] }),
    );
    await chooseFile();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create missing categories' }));
    fireEvent.click(screen.getByRole('button', { name: 'Check the file (dry run)' }));
    expect(await screen.findByText('Mixed scripts')).toBeVisible();
    expect(screen.getByText('No errors. You can import this file.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]).toContain('dryRun=true');
    expect(calls[0]).toContain('createMissingCategories=true');
    expect(calls[1]).toContain('dryRun=false');
    expect(calls[1]).toContain('createMissingCategories=true');
    expect((await screen.findAllByText('Import complete')).length).toBeGreaterThan(0);
  });

  it('changing an option after the dry run requires a new dry run', async () => {
    setup(() => report({}));
    await chooseFile();
    fireEvent.click(screen.getByRole('button', { name: 'Check the file (dry run)' }));
    await screen.findByText('No errors. You can import this file.');
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Create missing categories' }));
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
  });
});
