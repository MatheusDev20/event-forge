import type { VenueSeatMap } from '../domain/seat-map';
import type { VenueEntity } from '../infrastructure/entities/venue.entity';
import { toSeatMap, toVenueSummary } from './venue.mapper';

const aVenue = (overrides: Partial<VenueEntity> = {}): VenueEntity =>
  ({
    id: 'venue-1',
    name: 'Allianz Parque',
    city: 'São Paulo',
    country: 'BR',
    createdAt: new Date(),
    ...overrides,
  }) as VenueEntity;

const seatMap = (sections: VenueSeatMap['sections']): VenueSeatMap => ({
  id: 'seat-map-1',
  name: 'Modo Show',
  sections,
});

describe('toVenueSummary', () => {
  it('carries the building across without inventing anything', () => {
    expect(toVenueSummary(aVenue())).toEqual({
      id: 'venue-1',
      name: 'Allianz Parque',
      city: 'São Paulo',
      country: 'BR',
    });
  });
});

describe('toSeatMap', () => {
  it('reports a general-admission section by its counter', () => {
    const [section] = toSeatMap(
      seatMap([
        {
          id: 'section-1',
          name: 'Pista',
          kind: 'general_admission',
          capacity: 15000,
          seatCount: 0,
        },
      ]),
    ).sections;

    expect(section.capacity).toBe(15000);
  });

  it('reports a seated section by its seat count, not its null column', () => {
    const [section] = toSeatMap(
      seatMap([
        {
          id: 'section-2',
          name: 'Plateia',
          kind: 'seated',
          capacity: null,
          seatCount: 288,
        },
      ]),
    ).sections;

    expect(section.capacity).toBe(288);
  });

  it('sums both kinds into the layout capacity', () => {
    const mapped = toSeatMap(
      seatMap([
        {
          id: 'section-1',
          name: 'Pista',
          kind: 'general_admission',
          capacity: 15000,
          seatCount: 0,
        },
        {
          id: 'section-2',
          name: 'Plateia',
          kind: 'seated',
          capacity: null,
          seatCount: 288,
        },
      ]),
    );

    expect(mapped.capacity).toBe(15288);
  });

  /**
   * The state an organizer passes through while drawing a room. It is the
   * reason `findSeatMaps` uses a LEFT JOIN, and the reason publishing later
   * refuses with `empty_seat_map` — so it has to survive the mapper intact
   * rather than being smoothed into something that looks sellable.
   */
  it('keeps an empty layout empty rather than hiding it', () => {
    expect(toSeatMap(seatMap([]))).toEqual({
      id: 'seat-map-1',
      name: 'Modo Show',
      capacity: 0,
      sections: [],
    });
  });
});
