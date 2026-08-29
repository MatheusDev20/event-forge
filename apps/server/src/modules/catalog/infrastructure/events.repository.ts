import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type SelectQueryBuilder } from 'typeorm';
import { PUBLICLY_VISIBLE_STATUSES } from '../domain/event';
import type { ListEventsCriteria } from '../domain/list-events-criteria';
import { INITIAL_EVENT_STATUS } from '../domain/new-event';
import type { NewEvent, ReferenceCheck } from '../domain/new-event';
import {
  PUBLISHABLE_FROM_STATUS,
  PUBLISHED_STATUS,
} from '../domain/publish-event';
import type { PublishCandidate, PublishSection } from '../domain/publish-event';
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

/**
 * How many seats a section actually contains, counted through its rows. Zero
 * for general admission, which has no rows by design — `sectionCapacity` reads
 * the counter column for those instead.
 */
const SECTION_SEAT_COUNT = `(
  SELECT COUNT(*)
  FROM seats seat
  JOIN seat_rows seat_row ON seat_row.id = seat.row_id
  WHERE seat_row.section_id = section.id
)`;

/**
 * Whether a price tier *of this event* covers the section.
 *
 * The join through price_tiers is the whole point: price_tier_sections alone
 * would answer "is this section priced by anyone", and a section priced only by
 * last year's event is not priced for this one.
 */
const SECTION_IS_PRICED = `EXISTS (
  SELECT 1
  FROM price_tier_sections mapping
  JOIN price_tiers tier ON tier.id = mapping.price_tier_id
  WHERE mapping.section_id = section.id
    AND tier.event_id = :eventId
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

  /**
   * Everything the publish rule needs to judge one event, in two queries.
   *
   * Gathered here rather than judged here: this returns facts, and
   * `publishBlocker` decides what they mean. That split is what lets the rules
   * be unit-tested without a database.
   */
  async findPublishCandidate(id: string): Promise<PublishCandidate | null> {
    const event = await this.events.findOne({
      where: { id },
      relations: { priceTiers: true },
    });

    if (!event) return null;

    return {
      status: event.status,
      seatMapId: event.seatMapId,
      priceTierCount: event.priceTiers.length,
      // No seat map means no sections to fetch — and `no_seat_map` blocks the
      // publish before anything looks at this array anyway.
      sections:
        event.seatMapId === null
          ? []
          : await this.findPublishSections(event.id, event.seatMapId),
    };
  }

  /**
   * The transition, as one conditional UPDATE.
   *
   * `AND status = 'draft'` is what makes two simultaneous publishes safe: both
   * can read a publishable draft, both can pass every rule, and exactly one
   * will match a row. The checks above exist to produce a clear message; this
   * line is the one that is actually authoritative — the same division of
   * labour as the slug's unique index behind `create`.
   *
   * `updated_at` is set explicitly because the column is a plain default, not
   * an @UpdateDateColumn; without this it would still read as the moment the
   * draft was inserted.
   */
  async markPublished(id: string): Promise<boolean> {
    const result = await this.events
      .createQueryBuilder()
      .update(EventEntity)
      .set({ status: PUBLISHED_STATUS, updatedAt: () => 'now()' })
      .where('id = :id AND status = :from', {
        id,
        from: PUBLISHABLE_FROM_STATUS,
      })
      .execute();

    return result.affected === 1;
  }

  private async findPublishSections(
    eventId: string,
    seatMapId: string,
  ): Promise<PublishSection[]> {
    const rows = await this.events.manager
      .getRepository(SectionEntity)
      .createQueryBuilder('section')
      .select('section.id', 'id')
      .addSelect('section.name', 'name')
      .addSelect('section.kind', 'kind')
      .addSelect('section.capacity', 'capacity')
      .addSelect(SECTION_SEAT_COUNT, 'seat_count')
      .addSelect(SECTION_IS_PRICED, 'is_priced')
      .where('section.seat_map_id = :seatMapId', { seatMapId })
      .setParameter('eventId', eventId)
      .orderBy('section.display_order', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        kind: PublishSection['kind'];
        capacity: number | null;
        seat_count: string;
        is_priced: boolean;
      }>();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      capacity: row.capacity,
      // COUNT() is a bigint, which pg hands back as a string rather than risk
      // a silent precision loss. Nothing downstream expects one.
      seatCount: Number(row.seat_count),
      isPriced: row.is_priced,
    }));
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
