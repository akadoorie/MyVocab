import { defineConfig } from 'vitest/config';

// Tests for the repo-level Node scripts in /scripts (e.g. the no-vocabulary guard).
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
  },
});
