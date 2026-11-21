import { expect, test, type Locator, type Page } from '@playwright/test';

// Admin journey (PRD §17 E2E) with the test-only session (the Access check is skipped in test).
// Synthetic content only.

async function addEntries(page: Page, heading: string, entries: string[]) {
  const section = page.getByRole('region', { name: heading });
  const input = section.getByRole('textbox').last();
  for (const entry of entries) {
    await input.fill(entry);
    await input.press('Enter');
    await expect(section.getByRole('button', { name: `Edit “${entry}”` })).toBeVisible();
  }
}

const nav = (page: Page, name: string): Locator =>
  page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name, exact: true }).first();

async function openNav(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Admin menu' });
  if (await menu.isVisible()) await menu.click();
  await nav(page, name).click();
}

test('admin creates an item, previews both directions, moves it to Trash and restores it', async ({
  page,
  baseURL,
}, testInfo) => {
  const res = await page.request.post('/api/test/session', {
    data: { role: 'admin', email: `e2e-admin-${testInfo.project.name}@example.test` },
    headers: { Origin: baseURL! },
  });
  expect(res.status()).toBe(200);
  const text = `e2e-item-${testInfo.project.name}-${Date.now()}`;

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('link', { name: '+ New item' }).click();

  // Header: language (fixed after creation), text, type, multiple meanings.
  await expect(page.getByLabel('Language')).toHaveValue('en');
  await page.getByLabel('Text (front of the card)').fill(text);
  await page.getByLabel('◆ Multiple meanings').check();
  await page.getByRole('button', { name: 'Create item' }).click();
  await expect(page.getByRole('heading', { name: text, level: 1 })).toBeVisible();
  await expect(page.getByText('Version 1')).toBeVisible();

  // Lists: each change saves at once (PATCH with the version).
  await addEntries(page, 'Hebrew meaning', ['מילה-ראשונה', 'מילה-שנייה']);
  await addEntries(page, 'Explanation', ['First synthetic meaning', 'Second synthetic meaning']);
  await addEntries(page, 'Synonyms', ['synthetic-synonym']);
  await addEntries(page, 'Hints', ['A synthetic hint.']);
  await expect(page.getByText('Version 7')).toBeVisible();
  await expect(page.getByText('No warnings')).toBeVisible();

  // Preview as learner: one card at a time. It opens on EN → HE (translation); the picker
  // switches to EN → EN (explanation). Hints and Flip work.
  const card = page.getByTestId('flip-card');
  await expect(card).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'English → Hebrew · Translation' })).toBeVisible();
  // The hints are under a live cover; a tap on it reveals them (D-047).
  await page.getByRole('button', { name: 'Tap to see hints', exact: true }).click();
  await expect(page.getByTestId('front-hints')).toBeVisible();
  await page.getByRole('button', { name: 'Flip', exact: true }).click();
  await expect(card).toHaveAttribute('data-side', 'back');
  await page.getByRole('button', { name: 'English, ready' }).click();
  await expect(
    page.getByRole('heading', { name: 'English → English · Explanation' }),
  ).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('data-side', 'front');

  // Move to Trash (confirm dialog names the item).
  await page.getByRole('button', { name: 'Move to Trash' }).click();
  await page
    .getByRole('dialog', { name: `Move “${text}” to Trash?` })
    .getByRole('button', { name: 'Move to Trash' })
    .click();
  await expect(page).toHaveURL(/\/admin\/items$/);

  // Restore it from Trash.
  await openNav(page, 'Trash');
  const row = page.getByRole('listitem').filter({ hasText: text });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Item restored')).toBeVisible();
  await expect(row).toHaveCount(0);

  await openNav(page, 'Items');
  await page.getByLabel('Search').fill(text);
  await expect(page.getByRole('link', { name: new RegExp(text) })).toBeVisible();
});

test('a learner is refused by the admin area', async ({ page, baseURL }, testInfo) => {
  await page.request.post('/api/test/session', {
    data: { role: 'user', email: `e2e-not-admin-${testInfo.project.name}@example.test` },
    headers: { Origin: baseURL! },
  });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
  expect((await page.request.get('/api/admin/stats')).status()).toBe(403);
});

test('CSV import: a dry run with errors and warnings, then a commit', async ({
  page,
  baseURL,
}, testInfo) => {
  await page.request.post('/api/test/session', {
    data: { role: 'admin', email: `e2e-import-${testInfo.project.name}@example.test` },
    headers: { Origin: baseURL! },
  });
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const header =
    'lang,text,type,multiple_meanings,topics,translation_he,translation_en,explanation,synonyms,hints,status';
  // Synthetic rows: one error (own-language translation), one with multiple-meanings warnings.
  const okRow = `en,csv-ok-${suffix},word,true,,מילה-סינתטית,,Only one synthetic meaning,,,published`;
  const bad = [header, `en,csv-bad-${suffix},word,false,,,own-language,,,,published`, okRow].join(
    '\n',
  );
  const good = [header, okRow].join('\n');
  const fileInput = () => page.getByLabel('CSV file (≤ 2 MB, ≤ 5,000 rows)');
  const importButton = () => page.getByRole('button', { name: 'Import', exact: true });

  expect((await page.request.get('/api/admin/import/template')).status()).toBe(200);
  await page.goto('/admin/import');

  await fileInput().setInputFiles({
    name: 'bad.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(bad),
  });
  await page.getByRole('button', { name: 'Check the file (dry run)' }).click();
  await expect(page.getByText('1 error')).toBeVisible();
  await expect(page.getByText('2 warnings')).toBeVisible();
  await expect(importButton()).toBeDisabled();

  await fileInput().setInputFiles({
    name: 'good.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(good),
  });
  await page.getByRole('button', { name: 'Check the file (dry run)' }).click();
  await expect(page.getByText('No errors. You can import this file.')).toBeVisible();
  await importButton().click();
  await expect(page.getByRole('heading', { name: 'Import complete' })).toBeVisible();

  await page.goto('/admin/items');
  await page.getByLabel('Search').fill(`csv-ok-${suffix}`);
  await expect(page.getByRole('link', { name: new RegExp(`csv-ok-${suffix}`) })).toBeVisible();
});
