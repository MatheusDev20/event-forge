import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import type { ListVenuesCriteria } from '../domain/list-venues-criteria';
import type { SeatMapSection, VenueSeatMap } from '../domain/seat-map';
import type { SectionKind } from '../domain/seat-map';
import { SectionEntity } from './entities/section.entity';
import { SeatMapEntity } from './entities/seat-map.entity';
import { VenueEntity } from './entities/venue.entity';
import { SECTION_SEAT_COUNT } from './section-seat-count';

/**
 * Reads over the rooms and the layouts in them.
 *
 * Separate from EventsRepository rather than folded into it because these
 * answer a different question: an event is an occasion and a venue is a
 * building, and the only reason this API can be asked about buildings at all
 * is that `POST /events` needs ids a caller has no other way to learn. Nothing
 * here writes — venues and seat maps arrive with the seed.
 */
@Injectable()
export class VenuesRepository {
  constructor(
    @InjectRepository(VenueEntity)
    private readonly venues: Repository<VenueEntity>,
  ) {}

  /**
   * One page of venues, and the total behind it.
   *
   * A single query, unlike `EventsRepository.listPublic`: there is no to-many
   * join here, so a LIMIT counts venues and there is nothing for it to
   * truncate. The two-step id-then-hydrate dance that listing events needs
   * would be ceremony.
   */
  async list(
    criteria: ListVenuesCriteria,
  ): Promise<{ items: VenueEntity[]; total: number }> {
    const [items, total] = await this.applyFilters(
      this.venues.createQueryBuilder('venue'),
      criteria,
    )
      // City first, so a page reads as a place rather than as an alphabet.
      // Name breaks the tie, and id breaks *that* one: without a total order,
      // two venues with the same name in the same city can swap between
      // queries and slip across a page boundary — the same reason
      // `applySort` ends on `event.id`.
      .orderBy('venue.city', 'ASC')
      .addOrderBy('venue.name', 'ASC')
      .addOrderBy('venue.id', 'ASC')
      .skip((criteria.page - 1) * criteria.pageSize)
      .take(criteria.pageSize)
      .getManyAndCount();

    return { items, total };
  }

  exists(venueId: string): Promise<boolean> {
    return this.venues.existsBy({ id: venueId });
  }

  /**
   * Every layout of one venue, with its sections and their capacity.
   *
   * One flat query with a LEFT JOIN, then grouped in memory — the same shape
   * as `findSeatMapLayout`, and for the same reason: the alternative is
   * TypeORM's nested `relations`, which issues a query per level to rebuild an
   * object graph this immediately walks back down.
   *
   * The join is LEFT so a seat map with no sections still comes back, as one
   * row with every section column NULL. That case is worth showing rather than
   * hiding: an empty layout is exactly what makes a later publish fail with
   * `empty_seat_map`, and a client that cannot see it has no way to explain
   * the refusal.
   */
  async findSeatMaps(venueId: string): Promise<VenueSeatMap[]> {
    const rows = await this.venues.manager
      .getRepository(SeatMapEntity)
      .createQueryBuilder('seat_map')
      .leftJoin(SectionEntity, 'section', 'section.seat_map_id = seat_map.id')
      .select('seat_map.id', 'seat_map_id')
      .addSelect('seat_map.name', 'seat_map_name')
      .addSelect('section.id', 'section_id')
      .addSelect('section.name', 'section_name')
      .addSelect('section.kind', 'section_kind')
      .addSelect('section.capacity', 'section_capacity')
      .addSelect(SECTION_SEAT_COUNT, 'seat_count')
      .where('seat_map.venue_id = :venueId', { venueId })
      .orderBy('seat_map.name', 'ASC')
      .addOrderBy('section.display_order', 'ASC', 'NULLS FIRST')
      .getRawMany<SeatMapRow>();

    return groupIntoSeatMaps(rows);
  }

  private applyFilters(
    qb: SelectQueryBuilder<VenueEntity>,
    criteria: ListVenuesCriteria,
  ): SelectQueryBuilder<VenueEntity> {
    if (criteria.search) {
      // ILIKE, like the event listing's search: honest about being a stopgap
      // at seed-data scale, and the same thing full-text search replaces.
      qb.andWhere('venue.name ILIKE :search', {
        search: `%${criteria.search}%`,
      });
    }

    if (criteria.city) {
      qb.andWhere('venue.city ILIKE :city', { city: criteria.city });
    }

    return qb;
  }
}

/** One row of the flattened query; section columns are NULL for an empty layout. */
type SeatMapRow = {
  seat_map_id: string;
  seat_map_name: string;
  section_id: string | null;
  section_name: string | null;
  section_kind: SectionKind | null;
  section_capacity: number | null;
  seat_count: string | null;
};

/**
 * Rebuilds seat maps from the joined rows.
 *
 * The `section_id === null` guard is the empty-layout case the LEFT JOIN
 * exists to preserve; without it every sectionless seat map would report one
 * phantom section. Same guard, same reasoning as `groupIntoSections` in
 * EventsRepository.
 */
function groupIntoSeatMaps(rows: SeatMapRow[]): VenueSeatMap[] {
  const seatMaps = new Map<
    string,
    VenueSeatMap & { sections: SeatMapSection[] }
  >();

  for (const row of rows) {
    let seatMap = seatMaps.get(row.seat_map_id);

    if (!seatMap) {
      seatMap = {
        id: row.seat_map_id,
        name: row.seat_map_name,
        sections: [],
      };
      seatMaps.set(row.seat_map_id, seatMap);
    }

    if (row.section_id === null) continue;

    seatMap.sections.push({
      id: row.section_id,
      name: row.section_name ?? '',
      // Not null once section_id is not: they come from the same row, and the
      // columns are NOT NULL in the table.
      kind: row.section_kind!,
      capacity: row.section_capacity,
      // COUNT() is a bigint, which pg hands back as a string rather than risk
      // a silent precision loss. Nothing downstream expects one.
      seatCount: Number(row.seat_count ?? 0),
    });
  }

  return [...seatMaps.values()];
}
