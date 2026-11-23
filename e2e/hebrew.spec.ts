import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { swipe } from './touch';

// The Hebrew UI (D-080): the default for a first visit, right-to-left, mirrored where direction
// matters. Synthetic seed/sample.csv data only.

// A first visit: nothing saved, so no English (playwright.config.ts saves it for other specs).
test.use({ storageState: { cookies: [], origins: [] } });

test('a first visit is in Hebrew, right-to-left, and switches to English', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const startCard = page.getByRole('region', { name: 'הגדרת התרגול' });
  await expect(startCard.getByText(/זמינ/)).toBeVisible();
  await expect(startCard.getByLabel('משפה', { exact: true })).toHaveValue('en');
  await expect(startCard.getByLabel('משפה', { exact: true }).locator('option:checked')).toHaveText(
    'אנגלית',
  );

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // The Home header switch shows the other language's short code ("En" / "עב") and is named in
  // that language; the choice is remembered.
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'English' }).locator('[aria-hidden]'),
  ).toHaveText('En');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('region', { name: 'Configure your practice' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Configure your practice' })).toBeVisible();
  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('a Hebrew practice: Hebrew buttons, Next on the left, Flip still bottom-right, direction on the left', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'הגדרת התרגול' })
    .getByRole('button', { name: 'התחלה' })
    .click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByTestId('progress')).toHaveText('סבב 1 · כרטיסיה 1/5 · 0 ידועים');
  await expect(page.getByRole('button', { name: 'לא ידעתי הצג בסבב הבא' })).toBeVisible();

  const box = async (name: string) =>
    (await page.getByRole('button', { name, exact: true }).last().boundingBox())!;
  const next = await box('הבא');
  const back = await box('הקודם');
  expect(next.x).toBeLessThan(back.x);

  const card = (await page.getByTestId('flip-card').boundingBox())!;
  const flip = (await page
    .getByTestId('flip-card')
    .getByRole('button', { name: 'היפוך' })
    .first()
    .boundingBox())!;
  expect(flip.x + flip.width / 2).toBeGreaterThan(card.x + card.width / 2);
  // The direction label stays on the card's left too.
  const chip = (await page.getByTestId('flip-card').getByText('EN → HE').first().boundingBox())!;
  expect(chip.x + chip.width / 2).toBeLessThan(card.x + card.width / 2);

  // Keyboard (desktop): mirrored like the buttons, ← is Next.
  if (testInfo.project.name === 'desktop') {
    await page.getByRole('button', { name: 'לא ידעתי הצג בסבב הבא' }).click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('progress')).toHaveText(/כרטיסיה 2\/5/);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('progress')).toHaveText(/כרטיסיה 1\/5/);
  }
});

test('on touch in Hebrew, the swipes are mirrored: right is Next, left is Back', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'הגדרת התרגול' })
    .getByRole('button', { name: 'התחלה' })
    .click();
  const progress = page.getByTestId('progress');
  await expect(progress).toHaveText(/כרטיסיה 1\/5/);
  await page.getByRole('button', { name: 'לא ידעתי הצג בסבב הבא' }).click();
  await swipe(page, 160);
  await expect(progress).toHaveText(/כרטיסיה 2\/5/);
  await swipe(page, -160);
  await expect(progress).toHaveText(/כרטיסיה 1\/5/);
});
