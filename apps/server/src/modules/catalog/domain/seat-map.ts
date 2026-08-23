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
