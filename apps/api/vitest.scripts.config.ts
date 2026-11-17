import { defineConfig } from 'vitest/config';

// Owner scripts (db:seed, db:export) against throw-away local D1 databases (PRD §17 "Scripts").
// Synthetic seed/sample.csv only.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
