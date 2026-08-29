/**
 * Allocation — the units of capacity one Event puts on sale, and the only
 * thing in this system anyone can contend over.
 *
 * `docs/domain-model.md` states the invariant this context exists to keep:
 *
 *     held + reserved ≤ capacity,  always, under any interleaving
 *
 * Note "any interleaving". That is not a promise application code can make on
 * its own, which is why the invariant is also a CHECK constraint on the table.
 * The rules here decide what *should* happen; Postgres decides what *did*.
 *
 * Pure, like Catalog's publish rules: no entities, no Nest, no manager. The
 * snapshot is worth testing exhaustively and should not need a database to say
 * what it would produce.
 */

/**
 * How a unit sells, mirroring Catalog's `SECTION_KINDS`.
 *
 * Mirrored rather than imported. Catalog's kind describes a *room*; this one
 * describes *stock*, and after ADR-0006 the two are copies that may legally
 * diverge — a venue re-lettered next year does not retroactively change what
 * was sold. The import-boundary rule would forbid the shortcut anyway, and
 * here it is forbidding something that is genuinely a different concept.
 */
export const ALLOCATION_KINDS = ['seated', 'general_admission'] as const;

export type AllocationKind = (typeof ALLOCATION_KINDS)[number];

/**
 * One allocation row, before it exists.
 *
 * Seat identity is denormalised — section name, row label, seat label — per
 * ADR-0006, so a ticket renders from this row alone at any point in the
 * future, whatever Catalog has done to the venue since.
 */
export type NewAllocation = {
  eventId: string;
  kind: AllocationKind;
  /** Traceability back to the layout, as a plain id. No foreign key: ADR-0001. */
  catalogSectionId: string;
  /** The seat this unit is; null for a general-admission counter. */
  catalogSeatId: string | null;
  sectionName: string;
  rowLabel: string | null;
  seatLabel: string | null;
  /** 1 for a seat. The section's capacity for a counter. */
  capacity: number;
};

/** The layout as this context needs to read it. Structurally Catalog's. */
export type SnapshotSection = {
  id: string;
  name: string;
  kind: AllocationKind;
  capacity: number | null;
  seats: readonly { id: string; rowLabel: string; seatLabel: string }[];
};

export type SnapshotLayout = {
  sections: readonly SnapshotSection[];
};

/** Why a layout cannot be put on sale as it stands. */
export type SnapshotRefusal =
  | { reason: 'no_sections' }
  | { reason: 'empty_sections'; sectionNames: string[] };

/**
 * The allocation rows a layout becomes.
 *
 * One row per seat for seated sections; one counter row per general-admission
 * section. That asymmetry is the whole point of ADR-0006's closing note — the
 * two contention shapes the roadmap wants compared are visible in the same
 * table, from the first migration, rather than bolted on later.
 *
 * `capacity: 1` for a seat is not padding. It makes the oversell invariant one
 * expression for both kinds: a seat with `held = 1` is full by exactly the
 * arithmetic that says a 500-capacity counter with `held = 500` is full, so
 * the CHECK constraint, the hold query and every later strategy get to be
 * written once instead of twice.
 */
export function planSnapshot(
  eventId: string,
  layout: SnapshotLayout,
): NewAllocation[] {
  return layout.sections.flatMap((section) =>
    section.kind === 'general_admission'
      ? [generalAdmissionRow(eventId, section)]
      : section.seats.map((seat) => seatedRow(eventId, section, seat)),
  );
}

/**
 * What would stop this layout going on sale, or null.
 *
 * Catalog's `publishBlocker` already refuses an empty seat map, and this is
 * deliberately not a second copy of that rule — it is the same question asked
 * of the *snapshot*, at the moment the rows are about to be written. The two
 * can disagree: a section emptied between the publish check and the snapshot
 * would pass the first and fail here, and failing here is what rolls the whole
 * publish back rather than committing an event with nothing to sell.
 */
export function snapshotRefusal(
  layout: SnapshotLayout,
): SnapshotRefusal | null {
  if (layout.sections.length === 0) return { reason: 'no_sections' };

  const empty = layout.sections.filter(
    (section) => allocatableUnits(section) === 0,
  );

  return empty.length > 0
    ? { reason: 'empty_sections', sectionNames: empty.map((s) => s.name) }
    : null;
}

/** How many units a section contributes. Seats for seated, the counter for GA. */
export function allocatableUnits(section: SnapshotSection): number {
  return section.kind === 'general_admission'
    ? (section.capacity ?? 0)
    : section.seats.length;
}

/** Total units a snapshot will put on sale. */
export function snapshotCapacity(layout: SnapshotLayout): number {
  return layout.sections.reduce(
    (total, section) => total + allocatableUnits(section),
    0,
  );
}

function seatedRow(
  eventId: string,
  section: SnapshotSection,
  seat: SnapshotSection['seats'][number],
): NewAllocation {
  return {
    eventId,
    kind: 'seated',
    catalogSectionId: section.id,
    catalogSeatId: seat.id,
    sectionName: section.name,
    rowLabel: seat.rowLabel,
    seatLabel: seat.seatLabel,
    capacity: 1,
  };
}

function generalAdmissionRow(
  eventId: string,
  section: SnapshotSection,
): NewAllocation {
  return {
    eventId,
    kind: 'general_admission',
    catalogSectionId: section.id,
    // No seat to point at, and no row or seat label to print. A GA ticket
    // names a section and nothing finer, which is exactly what makes its
    // single counter row the hot one.
    catalogSeatId: null,
    sectionName: section.name,
    rowLabel: null,
    seatLabel: null,
    capacity: section.capacity ?? 0,
  };
}
