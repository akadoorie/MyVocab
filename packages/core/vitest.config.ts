import { defineConfig } from 'vitest/config';

// packages/core must stay at >= 90% coverage (PRD §15, §17).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts', 'src/**/types.ts'],
      thresholds: { lines: 90, functions: 90, branches: 90, statements: 90 },
      reporter: ['text-summary', 'text'],
    },
  },
});
