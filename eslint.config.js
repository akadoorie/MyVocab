// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Bans raw SQL in application code (PRD §14.4): `sql.raw(...)`, and `.exec(...)` on a database
 * object (multi-statement execution). Parameterized Drizzle queries only.
 */
const noRawSql = {
  'no-restricted-syntax': [
    'error',
    {
      selector: "CallExpression[callee.object.name='sql'][callee.property.name='raw']",
      message: 'sql.raw() is banned (PRD §14.4). Use parameterized Drizzle queries.',
    },
    {
      selector:
        "CallExpression[callee.property.name='exec'][callee.object.name=/^(db|d1|DB|database)$/]",
      message: 'db.exec() / multi-statement execution is banned (PRD §14.4).',
    },
    {
      selector:
        "CallExpression[callee.property.name='exec'][callee.object.property.name=/^(DB|db)$/]",
      message: 'env.DB.exec() / multi-statement execution is banned (PRD §14.4).',
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.wrangler/**',
      '**/worker-configuration.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...noRawSql,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y-x': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'eval', message: 'eval is banned.' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned (PRD §14.4).',
        },
      ],
    },
  },
);
