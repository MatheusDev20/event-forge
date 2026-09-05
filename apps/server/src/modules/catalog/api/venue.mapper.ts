import type { SeatMap, VenueSummary } from '@repo/contracts/catalog';
import { sectionCapacity, seatMapCapacity } from '../domain/seat-map';
import type { VenueSeatMap } from '../domain/seat-map';
import type { VenueEntity } from '../infrastructure/entities/venue.entity';

/**
 * Venue domain → wire, the same job `event.mapper.ts` does for events: both
 * sides are typed, so a field renamed on either one fails here at compile time
 * rather than in a client.
 */
export function toVenueSummary(venue: VenueEntity): VenueSummary {
  return {
    id: venue.id,
    name: venue.name,
    city: venue.city,
    country: venue.country,
  };
}

/**
 * A layout, with capacity resolved.
 *
 * This is the one place the nullable `capacity` column becomes a number a
 * client can add up. `sectionCapacity` does the resolving — the rule that a
 * seated section's capacity is its seat count while a general-admission
 * section's is its counter belongs to the domain, and is already unit-tested
 * there. Re-deriving it here would be a second implementation of the one thing
 * `seat-map.ts` exists to define.
 */
export function toSeatMap(seatMap: VenueSeatMap): SeatMap {
  return {
    id: seatMap.id,
    name: seatMap.name,
    capacity: seatMapCapacity(seatMap.sections),
    sections: seatMap.sections.map((section) => ({
      id: section.id,
      name: section.name,
      kind: section.kind,
      capacity: sectionCapacity(section),
    })),
  };
}
