import { expect, test, type Page } from '@playwright/test';

// Guest journey (PRD §17 E2E). Runs against synthetic seed/sample.csv data only.

const progress = (page: Page) => page.getByTestId('progress');
const card = (page: Page) => page.getByTestId('flip-card');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).last();

test('a guest starts with the defaults and plays a loop to the summary', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');

  // Defaults: EN → HE, the Sample set (D-038), Words, amount locked at 5, all "default".
  const startCard = page.getByRole('region', { name: 'Configure your session' });
  await expect(startCard.getByLabel('From', { exact: true })).toHaveValue('en');
  await expect(startCard.getByLabel('To', { exact: true })).toHaveValue('he');
  await expect(startCard.getByLabel('Topic', { exact: true })).toHaveValue('sample');
  await expect(startCard.getByText('Sign-in to choose any topic.')).toBeVisible();
  // The locked entries are drawn grey in the open list, "Sample set" stays bright (D-041):
  // "All topics" and a topic under the "Topics" entry, all top-level, disabled and unselectable
  // (Chrome ignores the colour of disabled options inside an optgroup).
  const colors = await startCard.getByLabel('Topic', { exact: true }).evaluate((el) => {
    const opts = [...(el as HTMLSelectElement).options];
    const color = (o: HTMLOptionElement | undefined) => (o ? getComputedStyle(o).color : '');
    const inGroup = opts.find((o) => o.textContent?.trim() === 'Home');
    return {
      sample: color(opts.find((o) => !o.disabled)),
      allTopics: color(opts.find((o) => o.disabled && o.parentElement === el)),
      topic: color(inGroup),
      topicDisabled: inGroup?.disabled,
      enabled: opts.filter((o) => !o.disabled).length,
    };
  });
  expect(colors).toEqual({
    sample: 'rgb(241, 238, 251)',
    allTopics: 'rgb(106, 98, 144)',
    topic: 'rgb(106, 98, 144)',
    topicDisabled: true,
    enabled: 1,
  });
  await expect(startCard.getByText('Default')).toHaveCount(5);
  await expect(startCard.getByText(/new cards? available/)).toBeVisible();

  // The sign-in message appears once automatically, and again when tapping the locked amount.
  // "Sign-in" is a link at the start of the sentence (D-043). On phones it is a toast; on desktop
  // it covers the Amount field itself (D-044).
  const toast = isMobile
    ? page.getByRole('status').filter({ hasText: 'to choose more cards per session.' })
    : startCard.locator('.amount-tip');
  await expect(toast).toHaveText('Sign-in to choose more cards per session.');
  await expect(toast.getByRole('button', { name: 'Sign-in' })).toBeVisible();
  await startCard.getByRole('button', { name: /Amount: 5/ }).click();
  await expect(toast).toBeVisible();

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

  // Know from the back side → next card, front side up. A guest's Know is the orange one; the
  // green "Don't show again" is locked (D-042).
  // The locked green button explains itself when tapped, and marks nothing (D-043).
  const locked = button(page, 'I know it Don’t show again (sign-in to enable)');
  await expect(locked).toHaveAttribute('aria-disabled', 'true');
  // Playwright won't click an aria-disabled button (a person can), and on phones the earlier
  // toast may still cover it: send the click to the button itself.
  await locked.dispatchEvent('click');
  // "Sign-in required" covers the locked button for a second, then goes (D-043).
  await expect(page.locator('.locked-tip')).toHaveText('Sign-in required');
  await expect(page.locator('.locked-tip')).toHaveCount(0, { timeout: 3000 });
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await button(page, 'I know it Show again in future').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  // Back shows that card again (front up, with its answer); Don't know changes the answer.
  await button(page, 'Back').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('answer-chip')).toHaveText(/Your answer: I know it/);
  await button(page, 'I don’t know Show again soon').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await button(page, 'Next').click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 2/5 · 0 known');

  // Don't know → auto-flip → the answers stay but turn off, and Next pumps.
  await button(page, 'I don’t know Show again soon').click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(button(page, 'I know it Show again in future')).toBeDisabled();
  await expect(button(page, 'I don’t know Show again soon')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveClass(/is-urgent/);
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
    else await button(page, 'I know it Show again in future').click();
  }
  await expect(page.getByRole('heading', { name: 'Session completed' })).toBeVisible();
  await expect(page.getByText('Sign-in to remember these words')).toBeVisible();

  // New session starts the next loop right away, with the same choices (FR-L32).
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(progress(page)).toHaveText(/^Cycle 1 · Card 1\/\d+ · 0 known$/);
  await expect(page).toHaveURL(/\/loop$/);
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
    .getByRole('region', { name: 'Configure your session' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  // Not answered yet: swiping left does nothing.
  await swipe(page, -160);
  await expect(progress(page)).toHaveText('Cycle 1 · Card 1/5 · 0 known');
  await button(page, 'I don’t know Show again soon').click();
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
    .getByRole('region', { name: 'Configure your session' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page).toHaveURL(/\/loop$/);
  await page.getByRole('button', { name: /Stop/ }).first().click({ force: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/loop');
  await expect(page).toHaveURL(/\/$/); // nothing to resume
});
