// wrangler (dev and tests) requires the assets directory to exist, even before the SPA is built.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

mkdirSync(fileURLToPath(new URL('../../web/dist', import.meta.url)), { recursive: true });
