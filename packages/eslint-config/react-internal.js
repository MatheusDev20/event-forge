import globals from 'globals';

import { config as baseConfig } from './base.js';

/**
 * ESLint configuration for internal React libraries that are bundled by
 * their consumer.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const config = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
];

export default config;
