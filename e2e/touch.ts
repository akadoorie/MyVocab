import type { Page } from '@playwright/test';

/** A touch swipe across the session card, as pointer events (PRD FR-L29b). */
export async function swipe(page: Page, dx: number) {
  const target = page.getByTestId('flip-card');
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
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
