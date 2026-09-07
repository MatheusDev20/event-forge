import js from '@eslint/js';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import pluginNext from '@next/eslint-plugin-next';

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: { '@next/next': pluginNext },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs['core-web-vitals'].rules,
    },
  },
  {
    // PostCSS config is CommonJS, loaded by Node rather than bundled.
    files: ['*.config.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
