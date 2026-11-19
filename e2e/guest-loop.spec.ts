import { expect, test, type Page } from '@playwright/test';

// Guest journey (PRD §17 E2E). Runs against synthetic seed/sample.csv data only.

const progress = (page: Page) => page.getByTestId('progress');
const card = (page: Page) => page.getByTestId('flip-card');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).last();

test('a guest starts with the defaults and plays a loop to the summary', async ({ page }) => {
  await page.goto('/');

  // Defaults: EN → HE, General, Words, amount locked at 5, all in the "default" style.
  const startCard = page.getByRole('region', { name: 'Start a session' });
  await expect(startCard.getByLabel('From', { exact: true })).toHaveValue('en');
  await expect(startCard.getByLabel('To', { exact: true })).toHaveValue('he');
  await expect(startCard.getByText('Default')).toHaveCount(5);
  await expect(startCard.getByText(/new cards? available/)).toBeVisible();

  // The register toast appears once automatically, and again when tapping the locked amount.
  const toastText = 'Please register in order to choose a larger amount of cards.';
  await expect(page.getByText(toastText)).toBeVisible();
  await startCard.getByRole('button', { name: /Amount: 5/ }).click();
  await expect(page.getByText(toastText)).toBeVisible();

  // Start without changing anything (invisible Turnstile with Cloudflare's test keys).
  await startCard.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/\/loop$/);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');

  // Hints on the front, then Flip shows hints on the back; flip back and forth by button and tap.
  await button(page, 'Hints').click();
  await expect(page.getByTestId('front-hints')).toBeVisible();
  await expect(button(page, 'Hints')).toHaveAttribute('aria-pressed', 'true');
  // Hints is a toggle: a second press hides them, a third shows them again.
  await button(page, 'Hints').click();
  await expect(page.getByTestId('front-hints')).toHaveCount(0);
  await button(page, 'Hints').click();
  await expect(page.getByTestId('front-hints')).toBeVisible();
  await button(page, 'Flip').click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(page.getByTestId('back-hints')).toBeVisible();
  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await card(page).click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');

  // Know from the back side → next card, front side up.
  await button(page, 'Know').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  // Back shows that card again (front up, with its answer); Don't know changes the answer.
  await button(page, 'Back').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('answer-chip')).toHaveText(/Your answer: Know/);
  await button(page, 'Don’t know').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await button(page, 'Next').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 0 known');

  // Don't know → auto-flip → one big Next in place of Know / Don't know.
  await button(page, 'Don’t know').click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(page.getByRole('button', { name: 'Know', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveCount(1);
  await button(page, 'Next').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 3/5 · 0 known');

  // A refresh resumes the same loop.
  await page.reload();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 3/5 · 0 known');

  // Know everything else; continue through cycle breaks until the summary.
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('heading', { name: 'Session completed' }).isVisible()) break;
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible()) await cont.click();
    else await button(page, 'Know').click();
  }
  await expect(page.getByRole('heading', { name: 'Session completed' })).toBeVisible();
  await expect(page.getByText('Sign in to remember these words')).toBeVisible();

  // New loop keeps the selection.
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page).toHaveURL(/\/$/);
});

/** A touch swipe across the card, as pointer events (PRD FR-L29b). */
async function swipe(page: Page, dx: number) {
  const box = (await card(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const target = page.getByTestId('flip-card');
  const ev = (clientX: number) => ({
    pointerType: 'touch',
    pointerId: 7,
    isPrimary: true,
    clientX,
    clientY: y,
    bubbles: true,
  });
  await target.dispatchEvent('pointerdown', ev(x));
  for (let i = 1; i <= 5; i++) await target.dispatchEvent('pointermove', ev(x + (dx * i) / 5));
  await target.dispatchEvent('pointerup', ev(x + dx));
}

test('on touch, swipe left is Next and swipe right is Back', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Start a session' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  // Not answered yet: swiping left does nothing.
  await swipe(page, -160);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await button(page, 'Don’t know').click();
  await swipe(page, -160);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 0 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  // A short swipe springs back; a full one goes back, front side up.
  await swipe(page, 20);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 0 known');
  await swipe(page, 160);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
});

test('Stop asks first, then ends the session and returns home', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Start a session' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page).toHaveURL(/\/loop$/);
  await page.getByRole('button', { name: /Stop/ }).first().click({ force: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/loop');
  await expect(page).toHaveURL(/\/$/); // nothing to resume
});
