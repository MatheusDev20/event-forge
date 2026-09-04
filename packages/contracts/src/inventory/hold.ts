import { z } from 'zod';
import { allocationKindSchema } from './availability';

/**
 * Hold contracts — the wire shape of a claim.
 *
 * `docs/domain-model.md`: a Hold is "a time-bounded, exclusive claim on
 * specific Allocation units by one attendee". Every noun in that sentence is
 * below, and nothing else is: whether a claim is *allowed* is the server's
 * domain layer's business, and a contract must never be imported by it.
 */

/**
 * How many units one request may claim, per line and in total.
 *
 * A ceiling rather than a policy. The real per-order limit is Ordering's
 * business and does not exist yet; this only stops a single request asking for
 * a whole stadium and holding the lock while it does.
 */
export const HOLD_MAX_QUANTITY = 10;
export const HOLD_MAX_LINES = 20;

/**
 * One line of a claim: which allocation, and how many of it.
 *
 * `quantity` exists because the two allocation shapes are asked for
 * differently. A seat is one unit and the quantity is always 1 — its capacity
 * makes anything else impossible. A general-admission counter is N units in a
 * single row, and asking for four of them is one line, not four. Keeping both
 * in one shape is what lets Slice 3 point the same endpoint at the hot row.
 */
export const holdLineInputSchema = z.object({
  allocationId: z.uuid(),
  quantity: z.int().min(1).max(HOLD_MAX_QUANTITY).default(1),
});

export const placeHoldSchema = z.object({
  /**
   * Who is claiming, as an opaque id.
   *
   * Optional, and minted by the server when absent. Identity is Slice 4 — the
   * race does not need to know who is racing, and inventing a fake user id to
   * satisfy a column would be a worse lie than an anonymous claim. What this
   * *does* need to be is stable per claimant, so the winner of a race can be
   * named afterwards.
   */
  holderId: z.uuid().optional(),
  lines: z.array(holdLineInputSchema).min(1).max(HOLD_MAX_LINES),
});

/**
 * A hold's lifecycle. Only `active` is ever written today.
 *
 * The other two are declared because they are the states the domain model
 * names — Release and Reservation — and a partial enum here would quietly
 * become the source of truth for a partial reality. Same reasoning as
 * `eventStatusSchema`.
 */
export const holdStatusSchema = z.enum(['active', 'released', 'converted']);

/** One line as it comes back: the claim, plus what the seat is called. */
export const holdLineSchema = z.object({
  allocationId: z.uuid(),
  quantity: z.int().min(1),
  kind: allocationKindSchema,
  sectionName: z.string(),
  rowLabel: z.string().nullable(),
  seatLabel: z.string().nullable(),
});

export const holdSchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  holderId: z.uuid(),
  status: holdStatusSchema,
  /**
   * When this claim stops being worth anything.
   *
   * **Recorded, not yet enforced.** Nothing sweeps expired holds and no read
   * discounts them, so today this is a timestamp a client may display and
   * nothing more. Enforcement is its own experiment (see docs/roadmap.md) and
   * it needs an injectable clock before it is testable at all. The column is
   * here from the first migration so that experiment is a change of behaviour
   * rather than a change of schema.
   */
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  lines: z.array(holdLineSchema),
});

export type HoldStatus = z.infer<typeof holdStatusSchema>;
export type HoldLineInput = z.infer<typeof holdLineInputSchema>;
export type PlaceHoldInput = z.infer<typeof placeHoldSchema>;
export type HoldLine = z.infer<typeof holdLineSchema>;
export type Hold = z.infer<typeof holdSchema>;
