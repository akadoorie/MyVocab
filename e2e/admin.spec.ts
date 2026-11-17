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
  await addEntries(page, 'Hebrew translation', ['מילה-ראשונה', 'מילה-שנייה']);
  await addEntries(page, 'Explanation', ['First synthetic meaning', 'Second synthetic meaning']);
  await addEntries(page, 'Synonyms', ['synthetic-synonym']);
  await addEntries(page, 'Hints', ['A synthetic hint.']);
  await expect(page.getByText('Version 7')).toBeVisible();
  await expect(page.getByText('No warnings')).toBeVisible();

  // Preview as learner: EN → HE (translation) and EN → EN (explanation), Hints and Flip working.
  const cards = page.getByTestId('flip-card');
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  await page.getByRole('button', { name: 'Hints', exact: true }).first().click();
  await expect(page.getByTestId('front-hints').first()).toBeVisible();
  await page.getByRole('button', { name: 'Flip', exact: true }).first().click();
  await expect(first).toHaveAttribute('data-side', 'back');

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
