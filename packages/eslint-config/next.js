import globals from 'globals';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

import { config as baseConfig } from './base.js';

/**
 * ESLint configuration for Next.js applications.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      // Pinned on purpose: eslint-plugin-react's automatic version detection
      // crashes under ESLint 10, and setting it here skips that code path.
      react: {
        version: '19.2',
      },
    },
  },
];

export default config;
