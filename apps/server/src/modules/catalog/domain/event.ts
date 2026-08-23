/**
 * Catalog's own vocabulary. These unions mirror the ones in @repo/contracts on
 * purpose: the contract describes the wire, this describes the domain, and the
 * mapper is the single place they are proven to agree. If the two ever need to
 * diverge — a status we track but do not publish — that becomes possible here
 * without a breaking API change.
 *
 * See docs/adr/0003-shared-contracts-with-zod.md.
 */
export const EVENT_STATUSES = [
  'draft',
  'published',
  'on_sale',
  'closed',
  'cancelled',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_CATEGORIES = [
  'music',
  'sports',
  'theatre',
  'conference',
  'comedy',
  'festival',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** The states an event is visible to the public in. */
export const PUBLICLY_VISIBLE_STATUSES: readonly EventStatus[] = [
  'published',
  'on_sale',
];

export const CURRENCIES = ['BRL', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
