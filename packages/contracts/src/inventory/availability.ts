import { z } from 'zod';
import { paginatedSchema, paginationQuerySchema } from '../shared/pagination';

/**
 * Availability — what an event still has to sell, as the wire sees it.
 *
 * This exists so a hold can be placed by someone who is not holding a psql
 * prompt. A client has to learn an allocation's id from somewhere, and until
 * seat map rendering exists (deliberately deferred), this is that somewhere.
 *
 * Note what it does *not* promise: `available` is a number that was true when
 * the row was read and may be false by the time anyone acts on it. That is not
 * a defect to be fixed with a fresher read — it is the nature of the thing, and
 * it is exactly why placing a hold re-decides under a lock rather than trusting
 * what a client was shown.
 */

export const allocationKindSchema = z.enum(['seated', 'general_admission']);

export const allocationAvailabilitySchema = z.object({
  /** What a hold request names. Inventory's id, not Catalog's seat id. */
  id: z.uuid(),
  kind: allocationKindSchema,
  sectionName: z.string(),
  /** Null for a general-admission counter, which names a section and nothing finer. */
  rowLabel: z.string().nullable(),
  seatLabel: z.string().nullable(),
  capacity: z.int(),
  /** `capacity - held - reserved`, at the instant of the read. */
  available: z.int(),
});

export const listAvailabilityQuerySchema = paginationQuerySchema.extend({
  /** Hide anything with nothing left, for a client that only renders what it can sell. */
  onlyAvailable: z.stringbool().default(false),
});

export const listAvailabilityResponseSchema = paginatedSchema(
  allocationAvailabilitySchema,
);

export type AllocationKind = z.infer<typeof allocationKindSchema>;
export type AllocationAvailability = z.infer<
  typeof allocationAvailabilitySchema
>;
export type ListAvailabilityQuery = z.infer<typeof listAvailabilityQuerySchema>;
export type ListAvailabilityResponse = z.infer<
  typeof listAvailabilityResponseSchema
>;
