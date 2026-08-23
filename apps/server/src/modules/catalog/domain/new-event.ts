import type { Currency, EventCategory, EventStatus } from './event';

/**
 * Catalog's own description of an event to create — dates as Dates, money as
 * minor units, and no wire vocabulary anywhere. The controller maps the
 * request body into this; nothing below api/ ever sees the contract type.
 */
export type NewPriceTier = {
  name: string;
  amountMinor: number;
  currency: Currency;
  /** Sections of the event's seat map this tier prices. */
  sectionIds: string[];
};

export type NewEvent = {
  slug: string;
  title: string;
  description: string;
  category: EventCategory;
  startsAt: Date;
  endsAt: Date | null;
  doorsOpenAt: Date | null;
  heroImageUrl: string | null;
  venueId: string;
  organizerId: string;
  seatMapId: string;
  priceTiers: NewPriceTier[];
};

/**
 * A created event is always a draft.
 *
 * Publishing is a transition, not a starting state: it is where the organizer's
 * capacity decisions become final and — after ADR-0006 — where Inventory copies
 * the seat map into allocations. An event that could be born `on_sale` would
 * skip all of it.
 */
export const INITIAL_EVENT_STATUS: EventStatus = 'draft';

/** What a create request referenced that the database could not confirm. */
export type ReferenceCheck = {
  venueExists: boolean;
  organizerExists: boolean;
  seatMapBelongsToVenue: boolean;
  /** Section ids that are not part of the requested seat map. */
  foreignSectionIds: string[];
};
