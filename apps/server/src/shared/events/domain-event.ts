/**
 * The cross-context language, as types.
 *
 * `docs/domain-model.md` calls a Domain Event "a past-tense fact one context
 * publishes and others react to", and lists the names before anything emits
 * them. This file is that list becoming real.
 *
 * It lives in shared/ rather than inside a context on purpose: an event is the
 * one thing two contexts are allowed to agree on. Everything else stays behind
 * a module's index.ts, and the import-boundary lint rule enforces it.
 *
 * These are facts, not commands. `EventPublished` says what happened; it does
 * not say "snapshot the seat map". What any subscriber does about it is that
 * subscriber's business, which is what keeps the emitting context ignorant of
 * who is listening.
 */

/**
 * Catalog published an event. Inventory's cue to materialise allocations —
 * see docs/adr/0006-seat-map-snapshot.md.
 *
 * It carries ids, not the layout. A large venue's seat map is tens of
 * thousands of seats, and an event payload that size is a copy of a table
 * being passed by value. Subscribers that need the layout ask Catalog for it
 * through its public surface, which is the path ADR-0001 sanctions anyway.
 */
export type EventPublished = {
  name: 'EventPublished';
  eventId: string;
  /** Never null: the publish rule refuses an event without a seat map. */
  seatMapId: string;
  occurredAt: Date;
};

/** Every fact this system publishes. The union grows; the bus does not. */
export type DomainEvent = EventPublished;

export type DomainEventName = DomainEvent['name'];
