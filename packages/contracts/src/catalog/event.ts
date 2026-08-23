import { z } from 'zod';
import { moneySchema } from '../shared/money';
import { paginatedSchema, paginationQuerySchema } from '../shared/pagination';

/**
 * Catalog contracts — the wire shapes for browsing events.
 *
 * These describe what crosses the network and nothing else. Business rules
 * (which transitions are legal, when an event may go on sale) live in the
 * server's domain layer; a contract must never be imported by it.
 */

/**
 * The full lifecycle, including states the public API never emits. It is
 * declared whole because the organizer console will need it, and a partial
 * enum here would quietly become the source of truth for a partial reality.
 */
export const eventStatusSchema = z.enum([
  'draft',
  'published',
  'on_sale',
  'closed',
  'cancelled',
]);

/** What the public event list is allowed to show. */
export const PUBLIC_EVENT_STATUSES = ['published', 'on_sale'] as const;

export const eventCategorySchema = z.enum([
  'music',
  'sports',
  'theatre',
  'conference',
  'comedy',
  'festival',
]);

/** URL-safe identifier for an event: lowercase, hyphen-separated. */
export const eventSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase, hyphenated slug');

export const venueSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string(),
  country: z.string().length(2),
});

export const organizerSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const priceTierSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  price: moneySchema,
});

/** The card shape: everything a listing needs, nothing it doesn't. */
export const eventSummarySchema = z.object({
  id: z.uuid(),
  slug: eventSlugSchema,
  title: z.string(),
  category: eventCategorySchema,
  status: eventStatusSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  venue: venueSummarySchema,
  organizer: organizerSummarySchema,
  /** Cheapest tier, for the "from R$ x" line. Null when no tiers are priced. */
  priceFrom: moneySchema.nullable(),
  heroImageUrl: z.url().nullable(),
});

export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  doorsOpenAt: z.iso.datetime().nullable(),
  priceTiers: z.array(priceTierSchema),
});

export const eventSortSchema = z.enum([
  'date_asc',
  'date_desc',
  'price_asc',
  'title_asc',
]);

export const listEventsQuerySchema = paginationQuerySchema.extend({
  /** Free-text match against title and venue name. */
  q: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(80).optional(),
  category: eventCategorySchema.optional(),
  /** Inclusive lower/upper bounds on the event start. */
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sort: eventSortSchema.default('date_asc'),
});

export const listEventsResponseSchema = paginatedSchema(eventSummarySchema);

export type EventStatus = z.infer<typeof eventStatusSchema>;
export type EventCategory = z.infer<typeof eventCategorySchema>;
export type VenueSummary = z.infer<typeof venueSummarySchema>;
export type OrganizerSummary = z.infer<typeof organizerSummarySchema>;
export type PriceTier = z.infer<typeof priceTierSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;
export type EventSort = z.infer<typeof eventSortSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;
