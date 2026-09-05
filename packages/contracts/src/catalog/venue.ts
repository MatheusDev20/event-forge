import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from '../shared/pagination';

/**
 * Venue contracts — the rooms events happen in, and the layouts they are sold
 * in.
 *
 * These are read-only shapes. Venues and seat maps are not authored through
 * the API; they arrive with the seed and, later, through an operator tool that
 * does not exist yet. What this file exists for is *discovery*: `POST /events`
 * asks for a `venueId`, a `seatMapId` and a set of `sectionIds`, and before
 * these endpoints the only way to learn any of them was a psql prompt.
 */

/**
 * A venue's identifier.
 *
 * A venue has no slug — unlike an event it is not a page anyone links to, and
 * inventing a public handle for a building would be a shape to maintain with
 * no reader.
 */
export const venueIdSchema = z.uuid();

/**
 * The building, as anything referring to one describes it.
 *
 * Lives here rather than beside the event schemas that embed it: an event
 * references a venue, so the dependency runs event → venue, and a shape should
 * be defined by the thing it describes.
 */
export const venueSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string(),
  country: z.string().length(2),
});

export const listVenuesQuerySchema = paginationQuerySchema.extend({
  /** Free-text match against the venue name. */
  q: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(80).optional(),
});

export const listVenuesResponseSchema = paginatedSchema(venueSummarySchema);

export type VenueId = z.infer<typeof venueIdSchema>;
export type VenueSummary = z.infer<typeof venueSummarySchema>;
export type ListVenuesQuery = z.infer<typeof listVenuesQuerySchema>;
export type ListVenuesResponse = z.infer<typeof listVenuesResponseSchema>;

/* ------------------------------------------------------------------ *
 * Seat maps
 * ------------------------------------------------------------------ */

/**
 * How a section sells what it holds.
 *
 * The same two words Inventory's `allocationKindSchema` uses, and deliberately
 * a separate declaration: this one describes a property of a room, that one
 * describes a row Inventory owns. They agree today because a snapshot copies
 * one into the other, not because either is derived from the other.
 */
export const sectionKindSchema = z.enum(['seated', 'general_admission']);

/**
 * One block of a layout.
 *
 * `capacity` is the resolved unit count — seats for a `seated` section, the
 * counter for `general_admission` — rather than the nullable column behind it.
 * A client picking sections to price wants to know how much of the room each
 * one is; which of two storage strategies produced the number is Catalog's
 * business, and `sections.capacity` being NULL for every seated section is the
 * kind of detail that only ever reaches a caller as a bug report.
 */
export const seatMapSectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: sectionKindSchema,
  capacity: z.int().nonnegative(),
});

export const seatMapSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Every section's capacity, summed. What Inventory snapshots at publish. */
  capacity: z.int().nonnegative(),
  /** Front to back, the order the room is drawn in. Never empty in practice — but see below. */
  sections: z.array(seatMapSectionSchema),
});

/**
 * Unpaginated, unlike every other collection this API returns.
 *
 * A venue's layouts are bounded by the building — a handful, forever — so
 * there is no page for a client to ask for and no `total` it does not already
 * have. The envelope is kept so the response is still an object and can grow a
 * sibling field later; the meta is dropped because it would only ever say
 * `page: 1`.
 */
export const listSeatMapsResponseSchema = z.object({
  items: z.array(seatMapSchema),
});

export type SectionKind = z.infer<typeof sectionKindSchema>;
export type SeatMapSection = z.infer<typeof seatMapSectionSchema>;
export type SeatMap = z.infer<typeof seatMapSchema>;
export type ListSeatMapsResponse = z.infer<typeof listSeatMapsResponseSchema>;
