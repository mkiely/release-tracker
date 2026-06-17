import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Build output and generated code are not ours to lint.
  { ignores: ['dist', 'coverage', 'packages/**/src/generated.ts'] },

  // App + library source (browser).
  {
    files: ['src/**/*.{ts,tsx}', 'packages/**/src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // The store/sync layers lean on `any` for generic persistence plumbing;
      // surface it as a warning rather than blocking the build on a refactor.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow `_`-prefixed throwaways and `{ x, ...rest }` field omissions.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // TypeScript config files run under Node but still need the TS parser.
  {
    files: ['*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },

  // Plain-JS Node tooling (build scripts, this config).
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },
);
