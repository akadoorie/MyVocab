import { expect, test, type Page } from '@playwright/test';
import { swipe } from './touch';

// Guest journey (PRD §17 E2E). Runs against synthetic seed/sample.csv data only.

const progress = (page: Page) => page.getByTestId('progress');
const card = (page: Page) => page.getByTestId('flip-card');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).last();

test('a guest starts with the defaults and plays a practice to the summary', async ({ page }) => {
  await page.goto('/');

  // Defaults: EN → HE, the Sample set (D-038), amount locked at 5, all "default".
  const startCard = page.getByRole('region', { name: 'Configure your practice' });
  await expect(startCard.getByLabel('From', { exact: true })).toHaveValue('en');
  await expect(startCard.getByLabel('To', { exact: true })).toHaveValue('he');
  await expect(startCard.getByLabel('Topic', { exact: true })).toHaveValue('sample');
  // The locked entries are drawn grey in the open list, "Sample set" stays bright (D-041):
  // "All topics" and a topic under the separator line, all top-level, disabled and unselectable
  // (Chrome ignores the colour of disabled options inside an optgroup; D-062 line).
  const colors = await startCard.getByLabel('Topic', { exact: true }).evaluate((el) => {
    const opts = [...(el as HTMLSelectElement).options];
    const color = (o: HTMLOptionElement | undefined) => (o ? getComputedStyle(o).color : '');
    const inGroup = opts.find((o) => o.textContent?.startsWith('Home')); // "Home [n]" (D-064)
    return {
      sample: color(opts.find((o) => !o.disabled)),
      allTopics: color(opts.find((o) => o.disabled && o.parentElement === el)),
      topic: color(inGroup),
      topicDisabled: inGroup?.disabled,
      enabled: opts.filter((o) => !o.disabled).length,
    };
  });
  // Above the line (D-063): "Sample set" in the accent colour, the locked "All topics" grey.
  expect(colors).toEqual({
    sample: 'rgb(155, 130, 255)',
    allTopics: 'rgb(133, 122, 174)',
    topic: 'rgb(106, 98, 144)',
    topicDisabled: true,
    enabled: 1,
  });
  await expect(startCard.getByText('Default')).toHaveCount(4); // From, To, Topic, Amount
  await expect(startCard.getByText(/cards? available/)).toBeVisible();

  // The sign-in message appears once automatically, and again when tapping the locked amount.
  // "Sign-in" is a link at the start (D-043). It covers the field itself, on phones too (D-044,
  // D-070).
  const toast = startCard.locator('.amount-tip');
  await expect(toast).toHaveText('Sign-in to change');
  await expect(toast.getByRole('button', { name: 'Sign-in' })).toBeVisible();
  await startCard.getByRole('button', { name: /Cards per practice: 5/ }).click();
  await expect(toast).toBeVisible();

  // Start without changing anything (invisible Turnstile with Cloudflare's test keys).
  await startCard.getByRole('button', { name: 'Start' }).click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');

  // Hints sit on the front under a live cover (D-047): a tap reveals, another covers. (A card
  // without hints or synonyms has no cover; the admin preview test always has one.)
  const cover = page.getByRole('button', { name: 'Tap to see hints', exact: true });
  if (await cover.count()) {
    await cover.click();
    await expect(page.getByTestId('front-hints')).toBeVisible();
    await expect(card(page)).toHaveAttribute('data-side', 'front'); // revealing doesn't flip
    // A tap on the revealed hints covers them again (D-078).
    await page.waitForTimeout(400); // not "right after scrolling"
    await page.locator('.flip-card__front .hints-area__scroll').click();
    await expect(page.getByTestId('front-hints')).toHaveCount(0);
    await button(page, 'Tap to see hints').click();
    await expect(page.getByTestId('front-hints')).toBeVisible();
  }
  // Only the Flip button turns the card; a tap on the card does nothing (D-047).
  await card(page).click({ position: { x: 20, y: 20 } });
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await button(page, 'Flip').click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(page.getByTestId('back-hints')).toBeVisible();
  await button(page, 'Flip').click();
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await button(page, 'Flip').click();
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
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');
  await button(page, 'I know it Show again in future').click();
  await expect(progress(page)).toHaveText('Round 1 · Card 2/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  // Back shows that card again (front up, with its answer); Don't know changes the answer.
  await button(page, 'Back').click();
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 1 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  await expect(page.getByTestId('answer-chip')).toHaveText(/Clicked: I know it/);
  await button(page, 'I don’t know Show again soon').click();
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');
  await button(page, 'Next').click();
  await expect(progress(page)).toHaveText('Round 1 · Card 2/5 · 0 known');

  // Don't know → auto-flip → the answers stay but turn off, and Next pumps.
  await button(page, 'I don’t know Show again soon').click();
  await expect(card(page)).toHaveAttribute('data-side', 'back');
  await expect(button(page, 'I know it Show again in future')).toBeDisabled();
  await expect(button(page, 'I don’t know Show again soon')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toHaveClass(/is-urgent/);
  await button(page, 'Next').click();
  await expect(progress(page)).toHaveText('Round 1 · Card 3/5 · 0 known');

  // A refresh resumes the same practice.
  await page.reload();
  await expect(progress(page)).toHaveText('Round 1 · Card 3/5 · 0 known');

  // Know everything else; continue through round breaks until the summary.
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('heading', { name: 'Practice completed' }).isVisible()) break;
    const cont = page.getByRole('button', { name: 'Continue' });
    if (await cont.isVisible()) await cont.click();
    else await button(page, 'I know it Show again in future').click();
  }
  await expect(page.getByRole('heading', { name: 'Practice completed' })).toBeVisible();
  await expect(page.getByText('Sign-in to skip words that no longer need to repeat')).toBeVisible();

  // New practice starts the next practice right away, with the same choices (FR-L32).
  await page.getByRole('button', { name: 'New practice' }).click();
  await expect(progress(page)).toHaveText(/^Round 1 · Card 1\/\d+ · 0 known$/);
  await expect(page).toHaveURL(/\/practice$/);
});

test('on touch, swipe left is Next and swipe right is Back', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Configure your practice' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');
  // Not answered yet: swiping left does nothing.
  await swipe(page, -160);
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');
  await button(page, 'I don’t know Show again soon').click();
  await swipe(page, -160);
  await expect(progress(page)).toHaveText('Round 1 · Card 2/5 · 0 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
  // A short swipe springs back; a full one goes back, front side up.
  await swipe(page, 20);
  await expect(progress(page)).toHaveText('Round 1 · Card 2/5 · 0 known');
  await swipe(page, 160);
  await expect(progress(page)).toHaveText('Round 1 · Card 1/5 · 0 known');
  await expect(card(page)).toHaveAttribute('data-side', 'front');
});

test('Home asks first, then ends the practice and returns home (no Stop, D-072)', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Configure your practice' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page).toHaveURL(/\/practice$/);
  await expect(page.getByRole('button', { name: 'Stop' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/practice');
  await expect(page).toHaveURL(/\/$/); // nothing to resume
});
