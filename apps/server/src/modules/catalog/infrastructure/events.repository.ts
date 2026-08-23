import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { PUBLICLY_VISIBLE_STATUSES } from '../domain/event';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import { INITIAL_EVENT_STATUS } from '../domain/new-event';
import type { NewEvent, ReferenceCheck } from '../domain/new-event';
import { EventEntity } from './entities/event.entity';
import { OrganizerEntity } from './entities/organizer.entity';
import { PriceTierEntity } from './entities/price-tier.entity';
import { PriceTierSectionEntity } from './entities/price-tier-section.entity';
import { SeatMapEntity } from './entities/seat-map.entity';
import { SectionEntity } from './entities/section.entity';
import { VenueEntity } from './entities/venue.entity';

/**
 * Cheapest tier for an event, as a scalar subquery. Kept as a constant because
 * both the sort and (later) the availability projection need the same
 * definition of "price from".
 */
const MIN_TIER_PRICE = `(
  SELECT MIN(tier.price_amount_minor)
  FROM price_tiers tier
  WHERE tier.event_id = event.id
)`;

const LIST_RELATIONS = {
  venue: true,
  organizer: true,
  priceTiers: true,
} as const;

@Injectable()
export class EventsRepository {
  constructor(
    @InjectRepository(EventEntity)
    private readonly events: Repository<EventEntity>,
  ) {}

  /**
   * Paginates in two steps — select the page of ids, then hydrate them.
   *
   * The single-query version joins price_tiers (a to-many) and then LIMITs,
   * which truncates rows rather than events. Selecting ids first means LIMIT
   * always counts events, and the hydration query is a clean fetch by id.
   */
  async listPublic(
    criteria: ListEventsCriteria,
  ): Promise<{ items: EventEntity[]; total: number }> {
    const filtered = this.applyFilters(
      this.events
        .createQueryBuilder('event')
        .innerJoin('event.venue', 'venue')
        .where('event.status IN (:...statuses)', {
          statuses: PUBLICLY_VISIBLE_STATUSES,
        }),
      criteria,
    );

    const total = await filtered.getCount();
    if (total === 0) return { items: [], total };

    const page = this.applySort(
      filtered
        .clone()
        .select('event.id', 'id')
        .addSelect(MIN_TIER_PRICE, 'min_price'),
      criteria.sort,
    )
      .offset((criteria.page - 1) * criteria.pageSize)
      .limit(criteria.pageSize);

    const rows = await page.getRawMany<{ id: string }>();
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total };

    const items = await this.events.find({
      where: { id: In(ids) },
      relations: LIST_RELATIONS,
    });

    // `find` does not preserve the order of an IN list, so restore the order
    // the paginated query established.
    const position = new Map(ids.map((id, index) => [id, index]));
    items.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    return { items, total };
  }

  /** Any status, including drafts. For reading back what was just created. */
  findById(id: string): Promise<EventEntity | null> {
    return this.events.findOne({ where: { id }, relations: LIST_RELATIONS });
  }

  /**
   * Checks everything a create request points at, in one round of queries.
   *
   * Two of these the database would catch on its own — a missing venue or
   * organizer fails the foreign key. The third it cannot: nothing stops
   * `price_tier_sections` referencing a section from an entirely different
   * venue's layout, because that table only ever sees section ids. So the check
   * lives here, and it is the reason this method exists rather than letting the
   * insert fail and translating the error.
   */
  async checkReferences(draft: NewEvent): Promise<ReferenceCheck> {
    const manager = this.events.manager;
    const sectionIds = [
      ...new Set(draft.priceTiers.flatMap((tier) => tier.sectionIds)),
    ];

    const [venueExists, organizerExists, seatMapBelongsToVenue, ownSections] =
      await Promise.all([
        manager.getRepository(VenueEntity).existsBy({ id: draft.venueId }),
        manager
          .getRepository(OrganizerEntity)
          .existsBy({ id: draft.organizerId }),
        manager
          .getRepository(SeatMapEntity)
          .existsBy({ id: draft.seatMapId, venueId: draft.venueId }),
        manager.getRepository(SectionEntity).find({
          where: { id: In(sectionIds), seatMapId: draft.seatMapId },
          select: { id: true },
        }),
      ]);

    const owned = new Set(ownSections.map((section) => section.id));

    return {
      venueExists,
      organizerExists,
      seatMapBelongsToVenue,
      foreignSectionIds: sectionIds.filter((id) => !owned.has(id)),
    };
  }

  /**
   * The event, its tiers, and the tier-to-section mapping, in one transaction.
   *
   * All or nothing is the only sensible boundary here: an event whose tiers
   * half-committed is priced wrongly rather than incompletely, and no read
   * anywhere would reveal it.
   */
  create(draft: NewEvent): Promise<string> {
    return this.events.manager.transaction(async (manager) => {
      const event = await manager.getRepository(EventEntity).save({
        slug: draft.slug,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        status: INITIAL_EVENT_STATUS,
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        doorsOpenAt: draft.doorsOpenAt,
        heroImageUrl: draft.heroImageUrl,
        venueId: draft.venueId,
        organizerId: draft.organizerId,
        seatMapId: draft.seatMapId,
      });

      for (const tier of draft.priceTiers) {
        const saved = await manager.getRepository(PriceTierEntity).save({
          eventId: event.id,
          name: tier.name,
          priceAmountMinor: tier.amountMinor,
          priceCurrency: tier.currency,
        });

        await manager.getRepository(PriceTierSectionEntity).save(
          tier.sectionIds.map((sectionId) => ({
            priceTierId: saved.id,
            sectionId,
          })),
        );
      }

      return event.id;
    });
  }

  findPublicBySlug(slug: string): Promise<EventEntity | null> {
    return this.events.findOne({
      where: { slug, status: In([...PUBLICLY_VISIBLE_STATUSES]) },
      relations: LIST_RELATIONS,
    });
  }

  private applyFilters(
    qb: SelectQueryBuilder<EventEntity>,
    criteria: ListEventsCriteria,
  ): SelectQueryBuilder<EventEntity> {
    if (criteria.search) {
      qb.andWhere('(event.title ILIKE :search OR venue.name ILIKE :search)', {
        // ILIKE is fine at seed-data scale and honest about being a stopgap;
        // full-text search is a Slice 5 problem, not a Slice 0 one.
        search: `%${criteria.search}%`,
      });
    }

    if (criteria.city) {
      qb.andWhere('venue.city ILIKE :city', { city: criteria.city });
    }

    if (criteria.category) {
      qb.andWhere('event.category = :category', {
        category: criteria.category,
      });
    }

    if (criteria.startsFrom) {
      qb.andWhere('event.startsAt >= :startsFrom', {
        startsFrom: criteria.startsFrom,
      });
    }

    if (criteria.startsUntil) {
      qb.andWhere('event.startsAt <= :startsUntil', {
        startsUntil: criteria.startsUntil,
      });
    }

    return qb;
  }

  /**
   * Every sort ends with a tiebreak on id. Without one, rows that compare equal
   * can be ordered differently between two queries, and an item slips between
   * pages or shows up on both.
   */
  private applySort(
    qb: SelectQueryBuilder<EventEntity>,
    sort: ListEventsCriteria['sort'],
  ): SelectQueryBuilder<EventEntity> {
    switch (sort) {
      case 'date_desc':
        qb.orderBy('event.startsAt', 'DESC');
        break;
      case 'price_asc':
        qb.orderBy('min_price', 'ASC', 'NULLS LAST');
        break;
      case 'title_asc':
        qb.orderBy('event.title', 'ASC');
        break;
      case 'date_asc':
      default:
        qb.orderBy('event.startsAt', 'ASC');
        break;
    }

    return qb.addOrderBy('event.id', 'ASC');
  }
}
