import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import onlyWarn from 'eslint-plugin-only-warn';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintConfigTurbo from 'eslint-config-turbo/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint configuration for every package in the monorepo.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintConfigTurbo,
  eslintConfigPrettier,
  {
    plugins: {
      'only-warn': onlyWarn,
      prettier: eslintPluginPrettier,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          trailingComma: 'all',
        },
      ],
    },
  },
  {
    // CommonJS tooling files (postcss.config.js, jest configs, ...).
    files: ['**/*.config.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];

export default config;
