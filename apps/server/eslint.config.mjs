import { config } from '@repo/eslint-config/nest';

/**
 * The bounded contexts from docs/domain-model.md. Listed even before their
 * directories exist, so the boundary rules are in force the day a context is
 * created rather than the day someone remembers to add it here.
 */
const CONTEXTS = [
  'catalog',
  'identity',
  'inventory',
  'notifications',
  'ordering',
];

/** The layers inside a context. None of them is another context's business. */
const INTERNAL_LAYERS = ['api', 'application', 'domain', 'infrastructure'];

/**
 * Patterns are matched against the import string, so naming the context
 * explicitly is what distinguishes `../../catalog/infrastructure/x` (a
 * violation) from `../../domain/x` (a file importing its own context's domain).
 * A wildcard cannot: its `*` happily matches `..`.
 */
const deepImportsIntoOtherContexts = (self) => ({
  group: CONTEXTS.filter((context) => context !== self).flatMap((context) =>
    INTERNAL_LAYERS.map((layer) => `**/${context}/${layer}/**`),
  ),
  message:
    'Cross-context deep import. Go through the other context’s index.ts (e.g. `../catalog`), which exports its application service — see docs/adr/0001-modular-monolith.md.',
});

const CONTRACTS_BELOW_THE_EDGE = {
  group: ['@repo/contracts', '@repo/contracts/**'],
  message:
    'Contracts are wire shapes and belong at the HTTP edge. Map to them in api/, not below it — see docs/adr/0003-shared-contracts-with-zod.md.',
};

/**
 * Flat config replaces rule options rather than merging them, so a file matched
 * by two blocks keeps only the last block's patterns. Every restriction that
 * applies to a file has to be listed together.
 */
const restrictImports = (...groups) => ({
  'no-restricted-imports': ['error', { patterns: groups }],
});

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  {
    ignores: ['dist/**', 'eslint.config.mjs'],
  },
  // ADR-0001: contexts talk through their public surface or not at all.
  ...CONTEXTS.map((context) => ({
    files: [`src/modules/${context}/**/*.ts`],
    rules: restrictImports(deepImportsIntoOtherContexts(context)),
  })),
  // ADR-0003: only api/ knows what the wire looks like.
  ...CONTEXTS.map((context) => ({
    files: [
      `src/modules/${context}/domain/**/*.ts`,
      `src/modules/${context}/application/**/*.ts`,
      `src/modules/${context}/infrastructure/**/*.ts`,
    ],
    rules: restrictImports(
      deepImportsIntoOtherContexts(context),
      CONTRACTS_BELOW_THE_EDGE,
    ),
  })),
];
