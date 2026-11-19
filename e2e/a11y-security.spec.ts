import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Accessibility (WCAG 2.2 AA, PRD §15) and the security headers/CSP of the served app (PRD §14.4).
// Synthetic data only.

async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy|Refused to (load|execute|apply|connect|frame)/i.test(msg.text())) {
      violations.push(msg.text());
    }
  });
  return violations;
}

async function session(page: Page, baseURL: string, role: 'user' | 'admin', name: string) {
  const res = await page.request.post('/api/test/session', {
    data: { role, email: `${name}@example.test` },
    headers: { Origin: baseURL },
  });
  expect(res.status()).toBe(200);
}

test('guest pages: no accessibility violations and no CSP violations', async ({ page }) => {
  const csp = collectCspViolations(page);
  await page.goto('/');
  await expect(page.getByText(/new cards? available/)).toBeVisible();
  await expectNoViolations(page, 'landing');

  await page
    .getByRole('region', { name: 'Configure your session' })
    .getByRole('button', { name: 'Start' })
    .click();
  await expect(page).toHaveURL(/\/loop$/);
  await expectNoViolations(page, 'loop (front)');
  await page.getByRole('button', { name: 'Don’t know', exact: true }).last().click();
  await expectNoViolations(page, 'loop (revealed)');

  await page.goto('/privacy');
  await expectNoViolations(page, 'privacy');
  expect(csp).toEqual([]);
});

test('signed-in and admin pages: no accessibility violations', async ({
  page,
  baseURL,
}, testInfo) => {
  await session(page, baseURL!, 'admin', `a11y-${testInfo.project.name}`);
  for (const [path, ready] of [
    ['/known', 'My known words'],
    ['/account', 'Account'],
    ['/admin', 'Dashboard'],
    ['/admin/items', 'Items'],
    ['/admin/items/1', 'Preview as learner'],
    ['/admin/trash', 'Trash'],
    ['/admin/categories', 'Categories'],
    ['/admin/users', 'Users'],
    ['/admin/settings', 'Settings'],
    ['/admin/import', 'CSV import'],
    ['/admin/audit', 'Audit log'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: ready, exact: true })).toBeVisible();
    await expectNoViolations(page, path);
  }
});

test('the loop works with the keyboard only', async ({ page }) => {
  await page.goto('/');
  const start = page
    .getByRole('region', { name: 'Configure your session' })
    .getByRole('button', { name: 'Start' });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/loop$/);
  const progress = page.getByTestId('progress');
  await expect(progress).toHaveText(/Card 1\/\d+ · 0 known/);
  await page.keyboard.press('h'); // Hints
  await expect(page.getByTestId('front-hints')).toBeVisible();
  await page.keyboard.press('f'); // Flip
  await expect(page.getByTestId('flip-card')).toHaveAttribute('data-side', 'back');
  await page.keyboard.press('k'); // Know
  await expect(progress).toHaveText(/Card 2\/\d+ · 1 known/);
  await page.keyboard.press('d'); // Don't know → revealed, Next focused
  await expect(page.getByRole('button', { name: 'Next', exact: true }).last()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(progress).toHaveText(/Card 3\/\d+/);
  await page.keyboard.press('Escape'); // Stop: asks first
  await expect(page.getByRole('dialog', { name: 'Stop the session?' })).toBeVisible();
  await page.keyboard.press('Tab'); // from No to Yes
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
});

test('pages and the API carry the security headers; robots.txt keeps the app out of search', async ({
  request,
}) => {
  const page = await request.get('/');
  const csp = page.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain('https://challenges.cloudflare.com');
  expect(page.headers()['x-content-type-options']).toBe('nosniff');
  expect(page.headers()['x-frame-options']).toBe('DENY');

  const health = await request.get('/api/health');
  expect(health.headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(health.headers()['cache-control']).toBe('no-store');

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /api/');
  expect(robots).toContain('Disallow: /admin');
});
