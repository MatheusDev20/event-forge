import { config } from '@repo/eslint-config/next';
import pluginQuery from '@tanstack/eslint-plugin-query';

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...config,
  ...pluginQuery.configs['flat/recommended'],
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
