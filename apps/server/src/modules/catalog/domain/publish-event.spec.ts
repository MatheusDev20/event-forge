import {
  publishBlocker,
  type PublishCandidate,
  type PublishSection,
} from './publish-event';

const ga = (
  name: string,
  capacity: number,
  isPriced = true,
): PublishSection => ({
  id: `section-${name}`,
  name,
  kind: 'general_admission',
  capacity,
  seatCount: 0,
  isPriced,
});

const seated = (
  name: string,
  seatCount: number,
  isPriced = true,
): PublishSection => ({
  id: `section-${name}`,
  name,
  kind: 'seated',
  capacity: null,
  seatCount,
  isPriced,
});

const candidate = (
  overrides: Partial<PublishCandidate> = {},
): PublishCandidate => ({
  status: 'draft',
  seatMapId: 'seat-map-1',
  priceTierCount: 2,
  sections: [ga('Pista', 500), seated('Plateia', 120)],
  ...overrides,
});

describe('publishBlocker', () => {
  it('lets a complete draft through', () => {
    expect(publishBlocker(candidate())).toBeNull();
  });

  it.each(['published', 'on_sale', 'closed', 'cancelled'] as const)(
    'refuses to publish an event that is already %s',
    (status) => {
      expect(publishBlocker(candidate({ status }))).toEqual({
        reason: 'wrong_status',
        status,
      });
    },
  );

  it('refuses an event with no seat map', () => {
    expect(publishBlocker(candidate({ seatMapId: null }))).toEqual({
      reason: 'no_seat_map',
    });
  });

  it('refuses an event with no price tiers', () => {
    expect(publishBlocker(candidate({ priceTierCount: 0 }))).toEqual({
      reason: 'no_price_tiers',
    });
  });

  it('refuses a seat map with no sections at all', () => {
    expect(publishBlocker(candidate({ sections: [] }))).toEqual({
      reason: 'empty_seat_map',
    });
  });

  it('refuses a layout whose sections exist but hold nobody', () => {
    // A seated section an organizer has named but not filled. Capacity is 0,
    // which sectionCapacity treats as legal arithmetic — this is the rule that
    // turns it into a refusal.
    expect(
      publishBlocker(candidate({ sections: [seated('Plateia', 0)] })),
    ).toEqual({ reason: 'empty_seat_map' });
  });

  it('checks capacity before pricing, so an empty layout cannot pass vacuously', () => {
    // No sections means no *unpriced* sections. Were the checks the other way
    // round, this candidate would publish.
    expect(publishBlocker(candidate({ sections: [] }))?.reason).toBe(
      'empty_seat_map',
    );
  });

  it('names every section no tier covers', () => {
    expect(
      publishBlocker(
        candidate({
          sections: [
            ga('Pista', 500),
            ga('Camarote', 40, false),
            seated('Balcão', 60, false),
          ],
        }),
      ),
    ).toEqual({
      reason: 'unpriced_sections',
      sectionNames: ['Camarote', 'Balcão'],
    });
  });

  it('accepts a layout that is entirely general admission', () => {
    expect(
      publishBlocker(candidate({ sections: [ga('Pista', 15000)] })),
    ).toBeNull();
  });

  it('accepts a layout that is entirely seated', () => {
    expect(
      publishBlocker(candidate({ sections: [seated('Plateia', 288)] })),
    ).toBeNull();
  });
});
