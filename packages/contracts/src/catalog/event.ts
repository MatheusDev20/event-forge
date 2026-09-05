import { z } from 'zod';
import { moneySchema } from '../shared/money';
import { paginatedSchema, paginationQuerySchema } from '../shared/pagination';
// Defined in ./venue, not re-exported here: index.ts star-exports both files,
// so a second export of the same name would be a conflict rather than a
// convenience.
import { venueSummarySchema } from './venue';

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

/**
 * An event's primary identifier.
 *
 * Transitions address an event by id while reads address it by slug: a slug is
 * a public, human-facing handle that an organizer may well rewrite, and
 * publishing should not stop working because the marketing copy changed.
 */
export const eventIdSchema = z.uuid();

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

export type EventId = z.infer<typeof eventIdSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;
export type EventCategory = z.infer<typeof eventCategorySchema>;
export type OrganizerSummary = z.infer<typeof organizerSummarySchema>;
export type PriceTier = z.infer<typeof priceTierSchema>;
export type EventSummary = z.infer<typeof eventSummarySchema>;
export type EventDetail = z.infer<typeof eventDetailSchema>;
export type EventSort = z.infer<typeof eventSortSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
export type ListEventsResponse = z.infer<typeof listEventsResponseSchema>;

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** One price band in a create request, plus the sections it covers. */
export const createPriceTierSchema = z.object({
  name: z.string().trim().min(1).max(80),
  price: moneySchema,
  /** Sections of the event's seat map this band prices. At least one. */
  sectionIds: z.array(z.uuid()).min(1),
});

/**
 * The body of `POST /events`.
 *
 * No `status` field, deliberately: creating an event always produces a
 * `draft`. Moving it to `published` or `on_sale` is a transition with rules of
 * its own — and, after ADR-0006, a transition that makes Inventory copy the
 * seat map. Letting a client post `status: 'on_sale'` would smuggle that whole
 * workflow into a create call.
 */
export const createEventSchema = z
  .object({
    slug: eventSlugSchema.max(180),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1),
    category: eventCategorySchema,
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable().default(null),
    doorsOpenAt: z.iso.datetime().nullable().default(null),
    heroImageUrl: z.url().nullable().default(null),
    venueId: z.uuid(),
    organizerId: z.uuid(),
    /** Which of the venue's layouts. The server checks it belongs to the venue. */
    seatMapId: z.uuid(),
    priceTiers: z.array(createPriceTierSchema).min(1).max(20),
  })
  .superRefine((input, ctx) => {
    if (input.endsAt !== null && input.endsAt < input.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Must be at or after startsAt',
      });
    }

    if (input.doorsOpenAt !== null && input.doorsOpenAt > input.startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['doorsOpenAt'],
        message: 'Doors cannot open after the event starts',
      });
    }

    const names = new Set<string>();
    const currencies = new Set<string>();
    /**
     * The invariant no constraint can express: price tiers belong to an event,
     * sections belong to a venue's layout, and no single table holds both — so
     * "a section is priced by at most one tier" has to be checked somewhere.
     * Here is the earliest somewhere, before a row is written.
     */
    const claimedSections = new Map<string, string>();

    input.priceTiers.forEach((tier, index) => {
      if (names.has(tier.name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['priceTiers', index, 'name'],
          message: `Duplicate tier name "${tier.name}"`,
        });
      }
      names.add(tier.name);
      currencies.add(tier.price.currency);

      tier.sectionIds.forEach((sectionId, sectionIndex) => {
        const claimedBy = claimedSections.get(sectionId);

        if (claimedBy !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['priceTiers', index, 'sectionIds', sectionIndex],
            message: `Section is already priced by tier "${claimedBy}"`,
          });
        } else {
          claimedSections.set(sectionId, tier.name);
        }
      });
    });

    if (currencies.size > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceTiers'],
        message: 'Every tier of an event must use the same currency',
      });
    }
  });

export type CreatePriceTier = z.infer<typeof createPriceTierSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
