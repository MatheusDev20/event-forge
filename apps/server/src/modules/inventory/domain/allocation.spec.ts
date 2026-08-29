import {
  allocatableUnits,
  planSnapshot,
  snapshotCapacity,
  snapshotRefusal,
  type SnapshotLayout,
  type SnapshotSection,
} from './allocation';

const EVENT = 'event-1';

const seated = (name: string, seatCount: number): SnapshotSection => ({
  id: `section-${name}`,
  name,
  kind: 'seated',
  capacity: null,
  seats: Array.from({ length: seatCount }, (_, index) => ({
    id: `seat-${name}-${index}`,
    rowLabel: 'A',
    seatLabel: String(index + 1),
  })),
});

const ga = (name: string, capacity: number): SnapshotSection => ({
  id: `section-${name}`,
  name,
  kind: 'general_admission',
  capacity,
  seats: [],
});

const layout = (...sections: SnapshotSection[]): SnapshotLayout => ({
  sections,
});

describe('planSnapshot', () => {
  it('writes one row per seat for a seated section', () => {
    const rows = planSnapshot(EVENT, layout(seated('Plateia', 3)));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      eventId: EVENT,
      kind: 'seated',
      catalogSectionId: 'section-Plateia',
      catalogSeatId: 'seat-Plateia-0',
      sectionName: 'Plateia',
      rowLabel: 'A',
      seatLabel: '1',
      capacity: 1,
    });
  });

  /**
   * The asymmetry ADR-0006 exists to produce: thousands of warm rows on one
   * side, a single hot row on the other, in the same table. It is what makes
   * the roadmap's contention comparison possible without a second schema.
   */
  it('writes exactly one counter row for a general-admission section', () => {
    const rows = planSnapshot(EVENT, layout(ga('Pista', 5000)));

    expect(rows).toEqual([
      {
        eventId: EVENT,
        kind: 'general_admission',
        catalogSectionId: 'section-Pista',
        catalogSeatId: null,
        sectionName: 'Pista',
        rowLabel: null,
        seatLabel: null,
        capacity: 5000,
      },
    ]);
  });

  /**
   * `capacity: 1` per seat is what lets `held + reserved <= capacity` be one
   * expression for both kinds — in the CHECK constraint, in the hold query,
   * and in every strategy Slice 3 compares.
   */
  it('gives every seat a capacity of one, so both kinds share one invariant', () => {
    const rows = planSnapshot(EVENT, layout(seated('Plateia', 4)));

    expect(rows.every((row) => row.capacity === 1)).toBe(true);
  });

  it('handles a mixed layout, which is what a real venue is', () => {
    const rows = planSnapshot(
      EVENT,
      layout(seated('Plateia', 2), ga('Pista', 500), seated('Frisas', 3)),
    );

    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.kind === 'seated')).toHaveLength(5);
    expect(rows.filter((row) => row.kind === 'general_admission')).toHaveLength(
      1,
    );
  });

  it('denormalises the labels a ticket prints, not references to them', () => {
    const [row] = planSnapshot(EVENT, layout(seated('Plateia', 1)));

    // ADR-0006: this row must still describe what was sold after Catalog
    // re-letters the venue, so the strings are copied, not pointed at.
    expect(row.sectionName).toBe('Plateia');
    expect(row.rowLabel).toBe('A');
    expect(row.seatLabel).toBe('1');
  });

  it('produces nothing for an empty layout rather than throwing', () => {
    // Judging the layout is `snapshotRefusal`'s job; this one only maps.
    expect(planSnapshot(EVENT, layout())).toEqual([]);
  });
});

describe('snapshotRefusal', () => {
  it('accepts a layout with capacity', () => {
    expect(
      snapshotRefusal(layout(seated('Plateia', 2), ga('Pista', 10))),
    ).toBeNull();
  });

  it('refuses a seat map with no sections', () => {
    expect(snapshotRefusal(layout())).toEqual({ reason: 'no_sections' });
  });

  /**
   * A seated section nobody has put seats in. Catalog's publish rule refuses
   * this too, and the duplication is deliberate: this one is asked at the
   * moment the rows are written, and it is what rolls the publish back if the
   * layout changed in between.
   */
  it('refuses a seated section with no seats, naming it', () => {
    expect(
      snapshotRefusal(layout(seated('Plateia', 2), seated('Balcão', 0))),
    ).toEqual({ reason: 'empty_sections', sectionNames: ['Balcão'] });
  });

  it('refuses a general-admission section with no capacity', () => {
    expect(snapshotRefusal(layout(ga('Pista', 0)))).toEqual({
      reason: 'empty_sections',
      sectionNames: ['Pista'],
    });
  });

  it('names every empty section, not just the first', () => {
    const refusal = snapshotRefusal(
      layout(seated('A', 0), ga('B', 0), seated('C', 1)),
    );

    expect(refusal).toEqual({
      reason: 'empty_sections',
      sectionNames: ['A', 'B'],
    });
  });
});

describe('allocatableUnits / snapshotCapacity', () => {
  it('counts seats for seated and the counter for general admission', () => {
    expect(allocatableUnits(seated('Plateia', 7))).toBe(7);
    expect(allocatableUnits(ga('Pista', 5000))).toBe(5000);
  });

  it('totals a mixed layout', () => {
    expect(
      snapshotCapacity(layout(seated('Plateia', 120), ga('Pista', 5000))),
    ).toBe(5120);
  });
});
