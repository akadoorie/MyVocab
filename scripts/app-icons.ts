/**
 * Writes the app's icons into apps/web/public from the logo next to "MyVocab" on the home page
 * (LogoMark in apps/web/src/components/Icons.tsx; keep the two in step) (D-134):
 *
 *   favicon.svg            the browser tab
 *   apple-touch-icon.png   the iPhone Home Screen (180×180; iOS rounds the corners itself)
 *   icon-192.png, icon-512.png, icon-maskable-512.png   the web app manifest
 *
 *   pnpm icons:build   regenerate after changing the logo
 *
 * The PNGs are drawn by the Playwright browser already used for the end-to-end tests.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = 'apps/web/public';
/** The app's background (theme-color in index.html). */
const BG = '#0e0b1a';

/** LogoMark's shapes, in its 32×32 box. */
const LOGO = `
  <defs>
    <linearGradient id="logo-a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#b69bff" />
      <stop offset="1" stop-color="#7c4dff" />
    </linearGradient>
  </defs>
  <rect x="12" y="6" width="15" height="20" rx="3.5" transform="rotate(14 19.5 16)" fill="#e9e3ff" opacity="0.9" />
  <rect x="4" y="6" width="16" height="21" rx="3.5" transform="rotate(-12 12 16.5)" fill="url(#logo-a)" />`;

/** The logo on the background, taking `scale` of the square's width; `radius` rounds the corners. */
function iconSvg(scale: number, radius = 0): string {
  const offset = (16 * (1 - scale)).toFixed(3);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="${radius}" fill="${BG}" />` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">${LOGO}</g></svg>`
  );
}

// Full-bleed squares: iOS and Android shape them. The maskable one keeps the logo inside the
// central safe circle (80% of the width), which a round mask may crop to.
const PNGS: { file: string; size: number; scale: number }[] = [
  { file: 'apple-touch-icon.png', size: 180, scale: 0.78 },
  { file: 'icon-192.png', size: 192, scale: 0.78 },
  { file: 'icon-512.png', size: 512, scale: 0.78 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.6 },
];

writeFileSync(join(OUT, 'favicon.svg'), iconSvg(0.92, 7) + '\n');
console.log(`wrote ${OUT}/favicon.svg`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const { file, size, scale } of PNGS) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:${BG}">` +
        iconSvg(scale).replace(
          '<svg ',
          `<svg width="${size}" height="${size}" style="display:block" `,
        ) +
        `</body></html>`,
    );
    await page.screenshot({ path: join(OUT, file) });
    console.log(`wrote ${OUT}/${file}`);
  }
} finally {
  await browser.close();
}
