import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Signed-in journey (PRD §17 E2E) with the test-only session endpoint (PRD §12.5), which exists
// only when ENVIRONMENT=test. Synthetic seed/sample.csv data only.

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).last();

async function signIn(page: Page, baseURL: string, email: string) {
  const res = await page.request.post('/api/test/session', {
    data: { role: 'user', email },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(200);
  // Start from a clean slate if an earlier local run left known items behind.
  await page.request.post('/api/me/known/restore', {
    data: { filter: {} },
    headers: { Origin: baseURL },
  });
}

async function available(request: APIRequestContext, source: string, target: string) {
  const res = await request.get(`/api/loops/available?source=${source}&target=${target}&type=word`);
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { available: number }).available;
}

async function openKnownWords(page: Page) {
  const headerLink = page.getByRole('banner').getByRole('link', { name: 'My known words' });
  if (await headerLink.isVisible()) {
    await headerLink.click();
  } else {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('link', { name: 'My known words' }).click();
  }
  await expect(page).toHaveURL(/\/known$/);
}

test('Know → My known words → hidden in every direction → Return to loops', async ({
  page,
  baseURL,
}, testInfo) => {
  await signIn(page, baseURL!, `e2e-${testInfo.project.name}@example.test`);
  const enHe = await available(page.request, 'en', 'he');
  const enEn = await available(page.request, 'en', 'en');

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
  await expect(page.getByText('Sign in with Google to remember')).toHaveCount(0);

  // Signed-in learners choose the amount: 20 (more than the synthetic set has).
  const startCard = page.getByRole('region', { name: 'Start a loop' });
  const amount20 = startCard.getByRole('radio', { name: '20' });
  await amount20.click();
  await expect(amount20).toHaveAttribute('aria-checked', 'true');
  await startCard.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/\/loop$/);
  await expect(page.getByText(`Only ${enHe} new cards in General`)).toBeVisible();
  await expect(page.getByTestId('progress')).toHaveText(`Cycle 1 · Card 1/${enHe} · 0 known`);

  // Know the first card, then stop the loop.
  const known = ((await page.getByTestId('front-text').textContent()) ?? '').trim();
  expect(known).toMatch(/^sample-word-\d$/);
  await button(page, 'Know').click();
  await expect(page.getByTestId('progress')).toContainText('1 known');
  await button(page, 'Stop').click();
  await expect(page).toHaveURL(/\/$/);

  // It appears in My known words…
  await openKnownWords(page);
  const row = page.getByRole('listitem').filter({ hasText: known });
  await expect(row).toBeVisible();
  await expect(row.getByText('Already knew')).toBeVisible();
  await expect(row.getByText('EN → HE:', { exact: false })).toBeVisible();

  // …and is no longer offered in either direction (EN → HE and EN → EN).
  await expect.poll(() => available(page.request, 'en', 'he')).toBe(enHe - 1);
  expect(await available(page.request, 'en', 'en')).toBe(enEn - 1);

  // Return to loops: available again everywhere.
  await row.getByRole('button', { name: 'Return to loops' }).click();
  await expect(page.getByText('1 word is back in your loops')).toBeVisible();
  await expect(page.getByText('No known words yet')).toBeVisible();
  expect(await available(page.request, 'en', 'he')).toBe(enHe);
  expect(await available(page.request, 'en', 'en')).toBe(enEn);
});

test('the account page shows the user and the privacy page explains what is stored', async ({
  page,
  baseURL,
}, testInfo) => {
  await signIn(page, baseURL!, `e2e-account-${testInfo.project.name}@example.test`);
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete my account' })).toBeDisabled();

  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
  await expect(page.getByText('What we store')).toBeVisible();
});
