/**
 * Seat maps — Catalog's description of *where people sit*, and nothing about
 * whether a given place is free. Availability is Inventory's word (see
 * docs/domain-model.md), and this context deliberately cannot answer it.
 *
 * A seat map belongs to a Venue and is reused across Events, so it describes a
 * room rather than an occasion. When an Event is published, Inventory copies
 * the layout into its own allocation rows and stops looking here — see
 * docs/adr/0006-seat-map-snapshot.md. That is why nothing below carries a
 * count of what is left.
 */

/**
 * How a section sells its capacity.
 *
 * The split is the whole reason this is modelled rather than stored as a
 * number: a `seated` section is a set of addressable seats and contends row by
 * row, a `general_admission` section is one counter and contends on a single
 * value. The roadmap wants those two compared under load, so they are distinct
 * in the schema from the first migration rather than a flag added later.
 */
export const SECTION_KINDS = ['seated', 'general_admission'] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

/**
 * The shape capacity arithmetic needs, so this file is not coupled to the
 * entities. Seated sections carry `capacity: null` — their capacity *is* their
 * seat count, and storing it twice invites the two to disagree.
 */
export type SectionCapacity = {
  kind: SectionKind;
  capacity: number | null;
  seatCount: number;
};

/**
 * The units one section puts on sale.
 *
 * A seated section with no seats is 0, not an error: an organizer building a
 * layout passes through that state, and rejecting it belongs in the publish
 * rule, not in arithmetic.
 */
export function sectionCapacity(section: SectionCapacity): number {
  return section.kind === 'general_admission'
    ? (section.capacity ?? 0)
    : section.seatCount;
}

/** Total units across a seat map. What Inventory will snapshot at publish. */
export function seatMapCapacity(sections: readonly SectionCapacity[]): number {
  return sections.reduce(
    (total, section) => total + sectionCapacity(section),
    0,
  );
}

/* ------------------------------------------------------------------ *
 * The layout, as another context sees it
 * ------------------------------------------------------------------ */

/**
 * One seat, flattened.
 *
 * Row and seat labels together, rather than a nested rows array, because the
 * only consumer is Inventory's snapshot and a snapshot row is flat: ADR-0006
 * has it denormalise section name, row label and seat label onto the
 * allocation. Handing over the tree only to flatten it on the other side would
 * put the same loop in two contexts.
 */
export type LayoutSeat = {
  id: string;
  rowLabel: string;
  seatLabel: string;
};

/** One section of a layout, with its seats if it has any. */
export type LayoutSection = {
  id: string;
  name: string;
  kind: SectionKind;
  /** General admission only; NULL for seated, as in the table. */
  capacity: number | null;
  /** Empty for general admission, which sells a counter rather than places. */
  seats: readonly LayoutSeat[];
};

/**
 * A whole seat map, as Catalog hands it across a context boundary.
 *
 * This type is Catalog's public surface for the layout — the sanctioned path
 * ADR-0001 leaves open, and the reason `EventPublished` can carry a seat map id
 * instead of tens of thousands of seats. It is a *copy*: what the receiver does
 * with it, including keeping it forever, is no longer Catalog's business, which
 * is precisely the point of ADR-0006.
 */
export type SeatMapLayout = {
  seatMapId: string;
  sections: readonly LayoutSection[];
};

/* ------------------------------------------------------------------ *
 * The layout, as the catalogue lists it
 * ------------------------------------------------------------------ */

/**
 * One section of a listed layout.
 *
 * `SectionCapacity` and nothing more, plus the two fields needed to name the
 * thing: this carries the *facts* capacity is derived from — the counter, the
 * seat count — rather than a resolved number, so `sectionCapacity` above stays
 * the only implementation of the rule. The mapper resolves it at the edge.
 */
export type SeatMapSection = SectionCapacity & {
  id: string;
  name: string;
};

/**
 * A venue's layout, listed rather than exported.
 *
 * Distinct from `SeatMapLayout` above, which exists for Inventory and carries
 * every seat. This one stops at the section: a client choosing which sections
 * to price needs eight rows, not fifty thousand, and handing it the snapshot
 * shape would make the cheap question cost what the expensive one does.
 */
export type VenueSeatMap = {
  id: string;
  name: string;
  sections: readonly SeatMapSection[];
};
